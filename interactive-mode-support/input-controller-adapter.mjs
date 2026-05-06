import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { extensionForImageMimeType, readClipboardImage } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/clipboard-image.js";
import { keyText } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/keybinding-hints.js";
import { TuiEventType } from "../tui-renderer/index.mjs";

export function setupKeyHandlers(host, deps) {
    host.defaultEditor.onEscape = () => {
        if (host.sessionStore.isStreamingActive()) {
            host.restoreQueuedMessagesToEditor({ abort: true });
        }
        else if (host.sessionStore.isBashActive()) {
            host.sessionStore.abortBash();
        }
        else if (host.isBashMode) {
            host.editor.setText("");
            host.isBashMode = false;
            host.updateEditorBorderColor();
        }
        else if (!host.editor.getText().trim()) {
            const action = host.settingsManager.getDoubleEscapeAction();
            if (action !== "none") {
                const now = Date.now();
                if (now - host.lastEscapeTime < 500) {
                    if (action === "tree") {
                        host.showTreeSelector();
                    }
                    else {
                        host.showUserMessageSelector();
                    }
                    host.lastEscapeTime = 0;
                }
                else {
                    host.lastEscapeTime = now;
                }
            }
        }
    };
    host.defaultEditor.onAction("app.clear", () => host.handleCtrlC());
    host.defaultEditor.onCtrlD = () => host.handleCtrlD();
    host.defaultEditor.onAction("app.suspend", () => host.handleCtrlZ());
    host.defaultEditor.onAction("app.thinking.cycle", () => host.cycleThinkingLevel());
    host.defaultEditor.onAction("app.model.cycleForward", () => host.cycleModel("forward"));
    host.defaultEditor.onAction("app.model.cycleBackward", () => host.cycleModel("backward"));
    host.ui.onDebug = () => host.handleDebugCommand();
    host.defaultEditor.onAction("app.model.select", () => host.showModelSelector());
    host.defaultEditor.onAction("app.tools.expand", () => host.toggleToolOutputExpansion());
    host.defaultEditor.onAction("app.thinking.toggle", () => host.toggleThinkingBlockVisibility());
    host.defaultEditor.onAction("app.editor.external", () => host.openExternalEditor());
    host.defaultEditor.onAction("app.message.followUp", () => host.handleFollowUp());
    host.defaultEditor.onAction("app.message.dequeue", () => host.handleDequeue());
    host.defaultEditor.onAction("app.session.new", () => host.handleClearCommand());
    host.defaultEditor.onAction("app.session.tree", () => host.showTreeSelector());
    host.defaultEditor.onAction("app.session.fork", () => host.showUserMessageSelector());
    host.defaultEditor.onAction("app.session.resume", () => host.showSessionSelector());
    host.defaultEditor.onChange = (text) => {
        const wasBashMode = host.isBashMode;
        host.isBashMode = text.trimStart().startsWith("!");
        if (wasBashMode !== host.isBashMode) {
            host.updateEditorBorderColor();
        }
    };
    host.defaultEditor.onPasteImage = () => {
        void handleClipboardImagePaste(host);
    };
}

export async function handleClipboardImagePaste(host) {
    try {
        const image = await readClipboardImage();
        if (!image) {
            return;
        }
        const tmpDir = os.tmpdir();
        const ext = extensionForImageMimeType(image.mimeType) ?? "png";
        const fileName = `pi-clipboard-${crypto.randomUUID()}.${ext}`;
        const filePath = path.join(tmpDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(image.bytes));
        host.editor.insertTextAtCursor?.(filePath);
        host.ui.requestRender();
    }
    catch {
        // Ignore clipboard errors.
    }
}

export function handleCtrlC(host) {
    const now = Date.now();
    if (now - host.lastSigintTime < 500) {
        void host.shutdown();
    }
    else {
        host.clearEditor();
        host.lastSigintTime = now;
    }
}

function submitUiEvent(host, text) {
    try {
        host.customTuiRenderer?.dispatch?.({
            type: TuiEventType.INPUT_SUBMIT,
            text,
            session: host.customTuiRenderer?.getSnapshot?.().session,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        host.lastCustomTuiDispatchError = error;
    }
}

export function setupEditorSubmitHandler(host) {
    host.defaultEditor.onSubmit = async (text) => {
        text = text.trim();
        if (!text) {
            return;
        }
        submitUiEvent(host, text);
        if (text === "/settings") {
            host.showSettingsSelector();
            host.editor.setText("");
            return;
        }
        if (text === "/scoped-models") {
            host.editor.setText("");
            await host.showModelsSelector();
            return;
        }
        if (text === "/model" || text.startsWith("/model ")) {
            const searchTerm = text.startsWith("/model ") ? text.slice(7).trim() : undefined;
            host.editor.setText("");
            await host.handleModelCommand(searchTerm);
            return;
        }
        if (text === "/export" || text.startsWith("/export ")) {
            await host.handleExportCommand(text);
            host.editor.setText("");
            return;
        }
        if (text === "/import" || text.startsWith("/import ")) {
            await host.handleImportCommand(text);
            host.editor.setText("");
            return;
        }
        if (text === "/share") {
            await host.handleShareCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/copy") {
            await host.handleCopyCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/name" || text.startsWith("/name ")) {
            host.handleNameCommand(text);
            host.editor.setText("");
            return;
        }
        if (text === "/session") {
            host.handleSessionCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/changelog") {
            host.handleChangelogCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/hotkeys") {
            host.handleHotkeysCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/fork") {
            host.showUserMessageSelector();
            host.editor.setText("");
            return;
        }
        if (text === "/clone") {
            host.editor.setText("");
            await host.handleCloneCommand();
            return;
        }
        if (text === "/tree") {
            host.showTreeSelector();
            host.editor.setText("");
            return;
        }
        if (text === "/login") {
            host.showOAuthSelector("login");
            host.editor.setText("");
            return;
        }
        if (text === "/logout") {
            host.showOAuthSelector("logout");
            host.editor.setText("");
            return;
        }
        if (text === "/new") {
            host.editor.setText("");
            await host.handleClearCommand();
            return;
        }
        if (text === "/compact" || text.startsWith("/compact ")) {
            const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : undefined;
            host.editor.setText("");
            await host.handleCompactCommand(customInstructions);
            return;
        }
        if (text === "/reload") {
            host.editor.setText("");
            await host.handleReloadCommand();
            return;
        }
        if (text === "/debug") {
            host.handleDebugCommand();
            host.editor.setText("");
            return;
        }
        if (text === "/arminsayshi") {
            host.handleArminSaysHi();
            host.editor.setText("");
            return;
        }
        if (text === "/dementedelves") {
            host.handleDementedDelves();
            host.editor.setText("");
            return;
        }
        if (text === "/resume") {
            host.showSessionSelector();
            host.editor.setText("");
            return;
        }
        if (text === "/quit") {
            host.editor.setText("");
            await host.shutdown();
            return;
        }
        if (text.startsWith("!")) {
            const isExcluded = text.startsWith("!!");
            const command = isExcluded ? text.slice(2).trim() : text.slice(1).trim();
            if (command) {
                if (host.sessionStore.isBashActive()) {
                    host.showWarning("A bash command is already running. Press Esc to cancel it first.");
                    host.editor.setText(text);
                    return;
                }
                host.editor.addToHistory?.(text);
                await host.handleBashCommand(command, isExcluded);
                host.isBashMode = false;
                host.updateEditorBorderColor();
                return;
            }
        }
        if (host.sessionStore.isCompactionActive()) {
            if (host.isExtensionCommand(text)) {
                host.editor.addToHistory?.(text);
                host.editor.setText("");
                await host.sessionStore.prompt(text);
            }
            else {
                host.queueCompactionMessage(text, "steer");
            }
            return;
        }
        if (host.sessionStore.isStreamingActive()) {
            host.editor.addToHistory?.(text);
            host.editor.setText("");
            await host.sessionStore.prompt(text, { streamingBehavior: "steer" });
            host.updatePendingMessagesDisplay();
            host.ui.requestRender();
            return;
        }
        host.flushPendingBashComponents();
        if (host.onInputCallback) {
            host.onInputCallback(text);
        }
        host.editor.addToHistory?.(text);
    };
}
