import { Spacer, Text } from "@mariozechner/pi-tui";
import { keyHint, keyText, rawKeyHint } from "../tui-renderer/index.mjs";
import { APP_NAME, APP_TITLE, getAgentDir, VERSION } from "../node_modules/@mariozechner/pi-coding-agent/dist/config.js";
import { DefaultPackageManager } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/package-manager.js";
import { isInstallTelemetryEnabled } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/telemetry.js";
import { getChangelogPath, getNewEntries, parseChangelog } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/changelog.js";
import { getPiUserAgent } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/pi-user-agent.js";
import { ensureTool } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/tools-manager.js";
import { checkForNewPiVersion } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/version-check.js";
import { onThemeChange, stopThemeWatcher, theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { runProcessLines } from "../shell-executor/index.mjs";
import * as path from "node:path";

class ExpandableText extends Text {
    getCollapsedText;
    getExpandedText;
    constructor(getCollapsedText, getExpandedText, expanded = false, paddingX = 0, paddingY = 0) {
        super(expanded ? getExpandedText() : getCollapsedText(), paddingX, paddingY);
        this.getCollapsedText = getCollapsedText;
        this.getExpandedText = getExpandedText;
    }
    setExpanded(expanded) {
        this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
    }
}

export async function init(host) {
    if (host.isInitialized)
        return;
    host.registerSignalHandlers();
    host.changelogMarkdown = host.getChangelogForDisplay();
    const [fdPath] = await Promise.all([ensureTool("fd"), ensureTool("rg")]);
    host.fdPath = fdPath;
    if (host.options.verbose || !host.settingsManager.getQuietStartup()) {
        const logo = theme.bold(theme.fg("accent", APP_NAME)) + theme.fg("dim", ` v${host.version}`);
        const hint = (keybinding, description) => keyHint(keybinding, description);
        const expandedInstructions = [
            hint("app.interrupt", "to interrupt"),
            hint("app.clear", "to clear"),
            rawKeyHint(`${keyText("app.clear")} twice`, "to exit"),
            hint("app.exit", "to exit (empty)"),
            hint("app.suspend", "to suspend"),
            keyHint("tui.editor.deleteToLineEnd", "to delete to end"),
            hint("app.thinking.cycle", "to cycle thinking level"),
            rawKeyHint(`${keyText("app.model.cycleForward")}/${keyText("app.model.cycleBackward")}`, "to cycle models"),
            hint("app.model.select", "to select model"),
            hint("app.tools.expand", "to expand tools"),
            hint("app.thinking.toggle", "to expand thinking"),
            hint("app.editor.external", "for external editor"),
            rawKeyHint("/", "for commands"),
            rawKeyHint("!", "to run bash"),
            rawKeyHint("!!", "to run bash (no context)"),
            hint("app.message.followUp", "to queue follow-up"),
            hint("app.message.dequeue", "to edit all queued messages"),
            hint("app.clipboard.pasteImage", "to paste image"),
            rawKeyHint("drop files", "to attach"),
        ].join("\n");
        const compactInstructions = [
            hint("app.interrupt", "interrupt"),
            rawKeyHint(`${keyText("app.clear")}/${keyText("app.exit")}`, "clear/exit"),
            rawKeyHint("/", "commands"),
            rawKeyHint("!", "bash"),
            hint("app.tools.expand", "more"),
        ].join(theme.fg("muted", " · "));
        const compactOnboarding = theme.fg("dim", `Press ${keyText("app.tools.expand")} to show full startup help and loaded resources.`);
        const onboarding = theme.fg("dim", `Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.`);
        host.builtInHeader = new ExpandableText(() => `${logo}\n${compactInstructions}\n${compactOnboarding}\n\n${onboarding}`, () => `${logo}\n${expandedInstructions}\n\n${onboarding}`, host.getStartupExpansionState(), 1, 0);
        host.rendererHost.setHeader([new Spacer(1), host.builtInHeader, new Spacer(1)]);
    }
    else {
        host.builtInHeader = new Text("", 0, 0);
        host.rendererHost.setHeader([host.builtInHeader]);
    }
    host.renderWidgets();
    host.rendererHost.attachMainLayout({ footer: host.footer, editor: host.editor });
    host.setupKeyHandlers();
    host.setupEditorSubmitHandler();
    host.ui.start();
    host.isInitialized = true;
    await host.rebindCurrentSession();
    host.renderInitialMessages();
    onThemeChange(() => {
        host.ui.invalidate();
        host.updateEditorBorderColor();
        host.ui.requestRender();
    });
    host.footerDataProvider.onBranchChange(() => {
        host.ui.requestRender();
    });
    await host.updateAvailableProviderCount();
}

export async function handleFatalRuntimeError(host, prefix, error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`${prefix}: ${message}`);
    stopThemeWatcher();
    host.stop();
    process.exit(1);
}

export function updateTerminalTitle(host) {
    const cwdBasename = path.basename(host.sessionStore.getCwd());
    const sessionName = host.sessionStore.getSessionName();
    if (sessionName) {
        host.ui.terminal.setTitle(`${APP_TITLE} - ${sessionName} - ${cwdBasename}`);
    }
    else {
        host.ui.terminal.setTitle(`${APP_TITLE} - ${cwdBasename}`);
    }
}

export async function run(host) {
    await host.init();
    checkForNewPiVersion(host.version).then((newVersion) => {
        if (newVersion) {
            host.showNewVersionNotification(newVersion);
        }
    });
    host.checkForPackageUpdates().then((updates) => {
        if (updates.length > 0) {
            host.showPackageUpdateNotification(updates);
        }
    });
    host.checkTmuxKeyboardSetup().then((warning) => {
        if (warning) {
            host.showWarning(warning);
        }
    });
    const { migratedProviders, modelFallbackMessage, initialMessage, initialImages, initialMessages } = host.options;
    if (migratedProviders && migratedProviders.length > 0) {
        host.showWarning(`Migrated credentials to auth.json: ${migratedProviders.join(", ")}`);
    }
    const modelsJsonError = host.sessionStore.getModelsJsonError();
    if (modelsJsonError) {
        host.showError(`models.json error: ${modelsJsonError}`);
    }
    if (modelFallbackMessage) {
        host.showWarning(modelFallbackMessage);
    }
    void host.maybeWarnAboutAnthropicSubscriptionAuth();
    if (initialMessage) {
        try {
            await host.sessionStore.prompt(initialMessage, { images: initialImages });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            host.showError(errorMessage);
        }
    }
    if (initialMessages) {
        for (const message of initialMessages) {
            try {
                await host.sessionStore.prompt(message);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                host.showError(errorMessage);
            }
        }
    }
    while (true) {
        const userInput = await host.getUserInput();
        try {
            await host.sessionStore.prompt(userInput);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            host.showError(errorMessage);
        }
    }
}

export async function checkForPackageUpdates(host) {
    if (process.env.PI_OFFLINE) {
        return [];
    }
    try {
        const packageManager = new DefaultPackageManager({
            cwd: host.sessionStore.getCwd(),
            agentDir: getAgentDir(),
            settingsManager: host.settingsManager,
        });
        const updates = await packageManager.checkForAvailableUpdates();
        return updates.map((update) => update.displayName);
    }
    catch {
        return [];
    }
}

export async function checkTmuxKeyboardSetup() {
    if (!process.env.TMUX)
        return undefined;
    const runTmuxShow = async (option) => {
        try {
            const result = await runProcessLines("tmux", ["show", "-gv", option], { timeout: 2000 });
            return result.exitCode === 0 ? result.stdoutLines.join("\n").trim() : undefined;
        }
        catch {
            return undefined;
        }
    };
    const [extendedKeys, extendedKeysFormat] = await Promise.all([
        runTmuxShow("extended-keys"),
        runTmuxShow("extended-keys-format"),
    ]);
    if (extendedKeys === undefined)
        return undefined;
    if (extendedKeys !== "on" && extendedKeys !== "always") {
        return "tmux extended-keys is off. Modified Enter keys may not work. Add `set -g extended-keys on` to ~/.tmux.conf and restart tmux.";
    }
    if (extendedKeysFormat === "xterm") {
        return "tmux extended-keys-format is xterm. Pi works best with csi-u. Add `set -g extended-keys-format csi-u` to ~/.tmux.conf and restart tmux.";
    }
    return undefined;
}

export function getChangelogForDisplay(host) {
    if (host.sessionStore.hasMessages()) {
        return undefined;
    }
    const lastVersion = host.settingsManager.getLastChangelogVersion();
    const changelogPath = getChangelogPath();
    const entries = parseChangelog(changelogPath);
    if (!lastVersion) {
        host.settingsManager.setLastChangelogVersion(VERSION);
        host.reportInstallTelemetry(VERSION);
        return undefined;
    }
    const newEntries = getNewEntries(entries, lastVersion);
    if (newEntries.length > 0) {
        host.settingsManager.setLastChangelogVersion(VERSION);
        host.reportInstallTelemetry(VERSION);
        return newEntries.map((e) => e.content).join("\n\n");
    }
    return undefined;
}

export function reportInstallTelemetry(host, version) {
    if (process.env.PI_OFFLINE) {
        return;
    }
    if (!isInstallTelemetryEnabled(host.settingsManager)) {
        return;
    }
    void fetch(`https://pi.dev/api/report-install?version=${encodeURIComponent(version)}`, {
        headers: {
            "User-Agent": getPiUserAgent(version),
        },
        signal: AbortSignal.timeout(5000),
    })
        .then(() => undefined)
        .catch(() => undefined);
}
