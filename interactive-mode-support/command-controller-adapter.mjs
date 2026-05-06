import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { BorderedLoader, DynamicBorder } from "../tui-renderer/index.mjs";
import { SessionImportFileNotFoundError } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session-runtime.js";
import { MissingSessionCwdError } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/session-cwd.js";
import { getChangelogPath, parseChangelog } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/changelog.js";
import { copyToClipboard } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/clipboard.js";
import { getShareViewerUrl } from "../node_modules/@mariozechner/pi-coding-agent/dist/config.js";
import { keyText } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/keybinding-hints.js";
import { setRegisteredThemes, setTheme, theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { runProcessSync, startNodeProcess } from "../shell-executor/index.mjs";

function isExpandable(obj) {
    return obj && typeof obj.setExpanded === "function";
}

export async function handleReloadCommand(host) {
    if (host.sessionStore.isStreamingActive()) {
        host.showWarning("Wait for the current response to finish before reloading.");
        return;
    }
    if (host.sessionStore.isCompactionActive()) {
        host.showWarning("Wait for compaction to finish before reloading.");
        return;
    }
    host.resetExtensionUI();
    const reloadBox = new Container();
    const borderColor = (s) => theme.fg("border", s);
    reloadBox.addChild(new DynamicBorder(borderColor));
    reloadBox.addChild(new Spacer(1));
    reloadBox.addChild(new Text(theme.fg("muted", "Reloading keybindings, extensions, skills, prompts, themes..."), 1, 0));
    reloadBox.addChild(new Spacer(1));
    reloadBox.addChild(new DynamicBorder(borderColor));
    const previousEditor = host.editor;
    host.rendererHost.setEditorComponent(reloadBox);
    host.ui.requestRender(true);
    await new Promise((resolve) => process.nextTick(resolve));
    const dismissReloadBox = (editor) => {
        host.rendererHost.setEditorComponent(editor);
        host.ui.requestRender();
    };
    try {
        await host.sessionStore.reload();
        host.keybindings.reload();
        const activeHeader = host.customHeader ?? host.builtInHeader;
        if (isExpandable(activeHeader)) {
            activeHeader.setExpanded(host.toolOutputExpanded);
        }
        setRegisteredThemes(host.sessionStore.getRegisteredThemes());
        host.hideThinkingBlock = host.settingsManager.getHideThinkingBlock();
        const themeName = host.settingsManager.getTheme();
        const themeResult = themeName ? setTheme(themeName, true) : { success: true };
        if (!themeResult.success) {
            host.showError(`Failed to load theme "${themeName}": ${themeResult.error}\nFell back to dark theme.`);
        }
        const editorPaddingX = host.settingsManager.getEditorPaddingX();
        const autocompleteMaxVisible = host.settingsManager.getAutocompleteMaxVisible();
        host.defaultEditor.setPaddingX(editorPaddingX);
        host.defaultEditor.setAutocompleteMaxVisible(autocompleteMaxVisible);
        if (host.editor !== host.defaultEditor) {
            host.editor.setPaddingX?.(editorPaddingX);
            host.editor.setAutocompleteMaxVisible?.(autocompleteMaxVisible);
        }
        host.ui.setShowHardwareCursor(host.settingsManager.getShowHardwareCursor());
        host.ui.setClearOnShrink(host.settingsManager.getClearOnShrink());
        host.setupAutocompleteProvider();
        const runner = host.sessionStore.getExtensionRunner();
        host.setupExtensionShortcuts(runner);
        host.rebuildChatFromMessages();
        dismissReloadBox(host.editor);
        host.showLoadedResources({
            force: false,
            showDiagnosticsWhenQuiet: true,
        });
        const modelsJsonError = host.sessionStore.getModelsJsonError();
        if (modelsJsonError) {
            host.showError(`models.json error: ${modelsJsonError}`);
        }
        host.showStatus("Reloaded keybindings, extensions, skills, prompts, themes");
    }
    catch (error) {
        dismissReloadBox(previousEditor);
        host.showError(`Reload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function handleExportCommand(host, text) {
    const outputPath = getPathCommandArgument(text, "/export");
    try {
        if (outputPath?.endsWith(".jsonl")) {
            const filePath = host.sessionStore.exportToJsonl(outputPath);
            host.showStatus(`Session exported to: ${filePath}`);
        }
        else {
            const filePath = await host.sessionStore.exportToHtml(outputPath);
            host.showStatus(`Session exported to: ${filePath}`);
        }
    }
    catch (error) {
        host.showError(`Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}

export function getPathCommandArgument(text, command) {
    if (text === command) {
        return undefined;
    }
    if (!text.startsWith(`${command} `)) {
        return undefined;
    }
    const argsString = text.slice(command.length + 1).trimStart();
    if (!argsString) {
        return undefined;
    }
    const firstChar = argsString[0];
    if (firstChar === "\"" || firstChar === "'") {
        const closingQuoteIndex = argsString.indexOf(firstChar, 1);
        if (closingQuoteIndex < 0) {
            return undefined;
        }
        return argsString.slice(1, closingQuoteIndex);
    }
    const firstWhitespaceIndex = argsString.search(/\s/);
    if (firstWhitespaceIndex < 0) {
        return argsString;
    }
    return argsString.slice(0, firstWhitespaceIndex);
}

export async function handleImportCommand(host, text) {
    const inputPath = getPathCommandArgument(text, "/import");
    if (!inputPath) {
        host.showError("Usage: /import <path.jsonl>");
        return;
    }
    const confirmed = await host.showExtensionConfirm("Import session", `Replace current session with ${inputPath}?`);
    if (!confirmed) {
        host.showStatus("Import cancelled");
        return;
    }
    try {
        if (host.loadingAnimation) {
            host.loadingAnimation.stop();
            host.loadingAnimation = undefined;
        }
        host.rendererHost.clearStatus();
        const result = await host.runtimeHost.importFromJsonl(inputPath);
        if (result.cancelled) {
            host.showStatus("Import cancelled");
            return;
        }
        host.renderCurrentSessionState();
        host.showStatus(`Session imported from: ${inputPath}`);
    }
    catch (error) {
        if (error instanceof MissingSessionCwdError) {
            const selectedCwd = await host.promptForMissingSessionCwd(error);
            if (!selectedCwd) {
                host.showStatus("Import cancelled");
                return;
            }
            const result = await host.runtimeHost.importFromJsonl(inputPath, selectedCwd);
            if (result.cancelled) {
                host.showStatus("Import cancelled");
                return;
            }
            host.renderCurrentSessionState();
            host.showStatus(`Session imported from: ${inputPath}`);
            return;
        }
        if (error instanceof SessionImportFileNotFoundError) {
            host.showError(`Failed to import session: ${error.message}`);
            return;
        }
        await host.handleFatalRuntimeError("Failed to import session", error);
    }
}

export async function handleShareCommand(host) {
    try {
        const authResult = runProcessSync("gh", ["auth", "status"], { encoding: "utf-8" });
        if (authResult.status !== 0) {
            host.showError("GitHub CLI is not logged in. Run 'gh auth login' first.");
            return;
        }
    }
    catch {
        host.showError("GitHub CLI (gh) is not installed. Install it from https://cli.github.com/");
        return;
    }
    const tmpFile = path.join(os.tmpdir(), "session.html");
    try {
        await host.sessionStore.exportToHtml(tmpFile);
    }
    catch (error) {
        host.showError(`Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`);
        return;
    }
    const loader = new BorderedLoader(host.ui, theme, "Creating gist...");
    host.rendererHost.setEditorComponent(loader);
    host.ui.requestRender();
    const restoreEditor = () => {
        loader.dispose();
        host.rendererHost.setEditorComponent(host.editor);
        try {
            fs.unlinkSync(tmpFile);
        }
        catch {
        }
    };
    let proc = null;
    loader.onAbort = () => {
        proc?.kill();
        restoreEditor();
        host.showStatus("Share cancelled");
    };
    try {
        const result = await new Promise((resolve) => {
            proc = startNodeProcess("gh", ["gist", "create", "--public=false", tmpFile]);
            let stdout = "";
            let stderr = "";
            proc.stdout?.on("data", (data) => {
                stdout += data.toString();
            });
            proc.stderr?.on("data", (data) => {
                stderr += data.toString();
            });
            proc.on("close", (code) => resolve({ stdout, stderr, code }));
        });
        if (loader.signal.aborted)
            return;
        restoreEditor();
        if (result.code !== 0) {
            const errorMsg = result.stderr?.trim() || "Unknown error";
            host.showError(`Failed to create gist: ${errorMsg}`);
            return;
        }
        const gistUrl = result.stdout?.trim();
        const gistId = gistUrl?.split("/").pop();
        if (!gistId) {
            host.showError("Failed to parse gist ID from gh output");
            return;
        }
        const previewUrl = getShareViewerUrl(gistId);
        host.showStatus(`Share URL: ${previewUrl}\nGist: ${gistUrl}`);
    }
    catch (error) {
        if (!loader.signal.aborted) {
            restoreEditor();
            host.showError(`Failed to create gist: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}

export async function handleCopyCommand(host) {
    const text = host.sessionStore.getLastAssistantText();
    if (!text) {
        host.showError("No agent messages to copy yet.");
        return;
    }
    try {
        await copyToClipboard(text);
        host.showStatus("Copied last agent message to clipboard");
    }
    catch (error) {
        host.showError(error instanceof Error ? error.message : String(error));
    }
}

export function handleNameCommand(host, text) {
    const name = text.replace(/^\/name\s*/, "").trim();
    if (!name) {
        const currentName = host.sessionStore.getSessionName();
        if (currentName) {
            host.noticeStore.showSessionName(currentName);
        }
        else {
            host.showWarning("Usage: /name <name>");
        }
        return;
    }
    host.sessionStore.setSessionName(name);
    host.noticeStore.showSessionNameSet(name);
}

export function handleSessionCommand(host) {
    const stats = host.sessionStore.getSessionStats();
    const sessionName = host.sessionStore.getSessionName();
    let info = `${theme.bold("Session Info")}\n\n`;
    if (sessionName) {
        info += `${theme.fg("dim", "Name:")} ${sessionName}\n`;
    }
    info += `${theme.fg("dim", "File:")} ${stats.sessionFile ?? "In-memory"}\n`;
    info += `${theme.fg("dim", "ID:")} ${stats.sessionId}\n\n`;
    info += `${theme.bold("Messages")}\n`;
    info += `${theme.fg("dim", "User:")} ${stats.userMessages}\n`;
    info += `${theme.fg("dim", "Assistant:")} ${stats.assistantMessages}\n`;
    info += `${theme.fg("dim", "Tool Calls:")} ${stats.toolCalls}\n`;
    info += `${theme.fg("dim", "Tool Results:")} ${stats.toolResults}\n`;
    info += `${theme.fg("dim", "Total:")} ${stats.totalMessages}\n\n`;
    info += `${theme.bold("Tokens")}\n`;
    info += `${theme.fg("dim", "Input:")} ${stats.tokens.input.toLocaleString()}\n`;
    info += `${theme.fg("dim", "Output:")} ${stats.tokens.output.toLocaleString()}\n`;
    if (stats.tokens.cacheRead > 0) {
        info += `${theme.fg("dim", "Cache Read:")} ${stats.tokens.cacheRead.toLocaleString()}\n`;
    }
    if (stats.tokens.cacheWrite > 0) {
        info += `${theme.fg("dim", "Cache Write:")} ${stats.tokens.cacheWrite.toLocaleString()}\n`;
    }
    info += `${theme.fg("dim", "Total:")} ${stats.tokens.total.toLocaleString()}\n`;
    if (stats.cost > 0) {
        info += `\n${theme.bold("Cost")}\n`;
        info += `${theme.fg("dim", "Total:")} ${stats.cost.toFixed(4)}`;
    }
    host.noticeStore.showSessionInfo(info);
}

export function handleChangelogCommand(host) {
    const changelogPath = getChangelogPath();
    const allEntries = parseChangelog(changelogPath);
    const changelogMarkdown = allEntries.length > 0
        ? allEntries
            .reverse()
            .map((e) => e.content)
            .join("\n\n")
        : "No changelog entries found.";
    host.noticeStore.showMarkdownPanel("What's New", changelogMarkdown);
}

export function capitalizeKey(key) {
    return key
        .split("/")
        .map((k) => k
        .split("+")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("+"))
        .join("/");
}

export function getAppKeyDisplay(action) {
    return capitalizeKey(keyText(action));
}

export function getEditorKeyDisplay(action) {
    return capitalizeKey(keyText(action));
}

export function handleHotkeysCommand(host) {
    const cursorUp = getEditorKeyDisplay("tui.editor.cursorUp");
    const cursorDown = getEditorKeyDisplay("tui.editor.cursorDown");
    const cursorLeft = getEditorKeyDisplay("tui.editor.cursorLeft");
    const cursorRight = getEditorKeyDisplay("tui.editor.cursorRight");
    const cursorWordLeft = getEditorKeyDisplay("tui.editor.cursorWordLeft");
    const cursorWordRight = getEditorKeyDisplay("tui.editor.cursorWordRight");
    const cursorLineStart = getEditorKeyDisplay("tui.editor.cursorLineStart");
    const cursorLineEnd = getEditorKeyDisplay("tui.editor.cursorLineEnd");
    const jumpForward = getEditorKeyDisplay("tui.editor.jumpForward");
    const jumpBackward = getEditorKeyDisplay("tui.editor.jumpBackward");
    const pageUp = getEditorKeyDisplay("tui.editor.pageUp");
    const pageDown = getEditorKeyDisplay("tui.editor.pageDown");
    const submit = getEditorKeyDisplay("tui.input.submit");
    const newLine = getEditorKeyDisplay("tui.input.newLine");
    const deleteWordBackward = getEditorKeyDisplay("tui.editor.deleteWordBackward");
    const deleteWordForward = getEditorKeyDisplay("tui.editor.deleteWordForward");
    const deleteToLineStart = getEditorKeyDisplay("tui.editor.deleteToLineStart");
    const deleteToLineEnd = getEditorKeyDisplay("tui.editor.deleteToLineEnd");
    const yank = getEditorKeyDisplay("tui.editor.yank");
    const yankPop = getEditorKeyDisplay("tui.editor.yankPop");
    const undo = getEditorKeyDisplay("tui.editor.undo");
    const tab = getEditorKeyDisplay("tui.input.tab");
    const interrupt = getAppKeyDisplay("app.interrupt");
    const clear = getAppKeyDisplay("app.clear");
    const exit = getAppKeyDisplay("app.exit");
    const suspend = getAppKeyDisplay("app.suspend");
    const cycleThinkingLevel = getAppKeyDisplay("app.thinking.cycle");
    const cycleModelForward = getAppKeyDisplay("app.model.cycleForward");
    const selectModel = getAppKeyDisplay("app.model.select");
    const expandTools = getAppKeyDisplay("app.tools.expand");
    const toggleThinking = getAppKeyDisplay("app.thinking.toggle");
    const externalEditor = getAppKeyDisplay("app.editor.external");
    const cycleModelBackward = getAppKeyDisplay("app.model.cycleBackward");
    const followUp = getAppKeyDisplay("app.message.followUp");
    const dequeue = getAppKeyDisplay("app.message.dequeue");
    const pasteImage = getAppKeyDisplay("app.clipboard.pasteImage");
    let hotkeys = `
**Navigation**
| Key | Action |
|-----|--------|
| \`${cursorUp}\` / \`${cursorDown}\` / \`${cursorLeft}\` / \`${cursorRight}\` | Move cursor / browse history (Up when empty) |
| \`${cursorWordLeft}\` / \`${cursorWordRight}\` | Move by word |
| \`${cursorLineStart}\` | Start of line |
| \`${cursorLineEnd}\` | End of line |
| \`${jumpForward}\` | Jump forward to character |
| \`${jumpBackward}\` | Jump backward to character |
| \`${pageUp}\` / \`${pageDown}\` | Scroll by page |

**Editing**
| Key | Action |
|-----|--------|
| \`${submit}\` | Send message |
| \`${newLine}\` | New line${process.platform === "win32" ? " (Ctrl+Enter on Windows Terminal)" : ""} |
| \`${deleteWordBackward}\` | Delete word backwards |
| \`${deleteWordForward}\` | Delete word forwards |
| \`${deleteToLineStart}\` | Delete to start of line |
| \`${deleteToLineEnd}\` | Delete to end of line |
| \`${yank}\` | Paste the most-recently-deleted text |
| \`${yankPop}\` | Cycle through the deleted text after pasting |
| \`${undo}\` | Undo |

**Other**
| Key | Action |
|-----|--------|
| \`${tab}\` | Path completion / accept autocomplete |
| \`${interrupt}\` | Cancel autocomplete / abort streaming |
| \`${clear}\` | Clear editor (first) / exit (second) |
| \`${exit}\` | Exit (when editor is empty) |
| \`${suspend}\` | Suspend to background |
| \`${cycleThinkingLevel}\` | Cycle thinking level |
| \`${cycleModelForward}\` / \`${cycleModelBackward}\` | Cycle models |
| \`${selectModel}\` | Open model selector |
| \`${expandTools}\` | Toggle tool output expansion |
| \`${toggleThinking}\` | Toggle thinking block visibility |
| \`${externalEditor}\` | Edit message in external editor |
| \`${followUp}\` | Queue follow-up message |
| \`${dequeue}\` | Restore queued messages |
| \`${pasteImage}\` | Paste image from clipboard |
| \`/\` | Slash commands |
| \`!\` | Run bash command |
| \`!!\` | Run bash command (excluded from context) |
`;
    const extensionRunner = host.sessionStore.getExtensionRunner();
    const shortcuts = extensionRunner.getShortcuts(host.keybindings.getEffectiveConfig());
    if (shortcuts.size > 0) {
        hotkeys += `
**Extensions**
| Key | Action |
|-----|--------|
`;
        for (const [key, shortcut] of shortcuts) {
            const description = shortcut.description ?? shortcut.extensionPath;
            const keyDisplay = key.replace(/\b\w/g, (c) => c.toUpperCase());
            hotkeys += `| \`${keyDisplay}\` | ${description} |\n`;
        }
    }
    host.noticeStore.showMarkdownPanel("Keyboard Shortcuts", hotkeys);
}

export async function handleClearCommand(host) {
    if (host.loadingAnimation) {
        host.loadingAnimation.stop();
        host.loadingAnimation = undefined;
    }
    host.rendererHost.clearStatus();
    try {
        const result = await host.runtimeHost.newSession();
        if (result.cancelled) {
            return;
        }
        host.renderCurrentSessionState();
        host.noticeStore.showNewSessionStarted();
    }
    catch (error) {
        await host.handleFatalRuntimeError("Failed to create session", error);
    }
}

export function handleDebugCommand(host) {
    host.noticeStore.showDebugLog();
}

export function handleArminSaysHi(host) {
    host.noticeStore.showArminSaysHi();
}

export function handleDementedDelves(host) {
    host.noticeStore.showDementedDelves();
}

export function handleDaxnuts(host) {
    host.noticeStore.showDaxnuts();
}

export function checkDaxnutsEasterEgg(host, model) {
    if (model.provider === "opencode" && model.id.toLowerCase().includes("kimi-k2.5")) {
        handleDaxnuts(host);
    }
}

export async function handleCompactCommand(host, customInstructions) {
    const entries = host.sessionStore.getEntries();
    const messageCount = entries.filter((e) => e.type === "message").length;
    if (messageCount < 2) {
        host.showWarning("Nothing to compact (no messages yet)");
        return;
    }
    if (host.loadingAnimation) {
        host.loadingAnimation.stop();
        host.loadingAnimation = undefined;
    }
    host.rendererHost.clearStatus();
    try {
        await host.sessionStore.compact(customInstructions);
    }
    catch {
    }
}
