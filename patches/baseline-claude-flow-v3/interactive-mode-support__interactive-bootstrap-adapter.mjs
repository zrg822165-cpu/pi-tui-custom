import { setKeybindings } from "@mariozechner/pi-tui";
import { createBashStore } from "../bash-store/index.mjs";
import { createEventStateRuntime } from "../event-state-runtime/index.mjs";
import { createNoticeStore } from "../notice-store/index.mjs";
import { createQueueStore } from "../queue-store/index.mjs";
import { createSessionStore } from "../session-store/index.mjs";
import { createToolFlowStore } from "../tool-flow-store/index.mjs";
import { createTranscriptStore } from "../transcript-store/index.mjs";
import { createUIStateStore } from "../ui-state-store/index.mjs";
import { createTuiRenderer, createTuiRendererHost, CustomEditor, FooterComponent, toTuiEvent } from "../tui-renderer/index.mjs";
import { VERSION } from "../node_modules/@mariozechner/pi-coding-agent/dist/config.js";
import { FooterDataProvider } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/footer-data-provider.js";
import { KeybindingsManager } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/keybindings.js";
import { getEditorTheme, initTheme, setRegisteredThemes, theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { ExpandableText } from "./expandable-text.mjs";

export function initializeInteractiveModeHost(host, runtimeHost, options = {}) {
    host.options = options;
    host.runtimeHost = runtimeHost;
    host.sessionStore = createSessionStore(runtimeHost);
    host.runtimeHost.setBeforeSessionInvalidate(() => {
        host.resetExtensionUI();
    });
    host.runtimeHost.setRebindSession(async () => {
        await host.rebindCurrentSession();
    });
    host.version = VERSION;
    host.rendererHost = createTuiRendererHost({
        showHardwareCursor: host.settingsManager.getShowHardwareCursor(),
        clearOnShrink: host.settingsManager.getClearOnShrink(),
    });
    const rendererParts = host.rendererHost.getParts();
    host.ui = rendererParts.ui;
    host.transcriptStore = createTranscriptStore(host, host.sessionStore);
    host.uiStateStore = createUIStateStore(host);
    host.toolFlowStore = createToolFlowStore(host);
    host.bashStore = createBashStore(host);
    host.queueStore = createQueueStore(host);
    host.noticeStore = createNoticeStore(host);
    host.eventStateRuntime = createEventStateRuntime({
        toTuiEvent,
    });
    host.setTranscriptTailRendering(false);
    host.keybindings = KeybindingsManager.create();
    setKeybindings(host.keybindings);
    const editorPaddingX = host.settingsManager.getEditorPaddingX();
    const autocompleteMaxVisible = host.settingsManager.getAutocompleteMaxVisible();
    host.defaultEditor = new CustomEditor(host.ui, getEditorTheme(), host.keybindings, {
        paddingX: editorPaddingX,
        autocompleteMaxVisible,
    });
    host.ExpandableText = ExpandableText;
    host.theme = theme;
    host.editor = host.defaultEditor;
    host.rendererHost.setEditorComponent(host.editor, { focus: false });
    host.footerDataProvider = new FooterDataProvider(host.sessionStore.getCwd());
    host.footer = new FooterComponent(host.sessionStore.getFooterSession(), host.footerDataProvider);
    host.footer.setAutoCompactEnabled(host.sessionStore.getAutoCompactionEnabled());
    host.hideThinkingBlock = host.settingsManager.getHideThinkingBlock();
    setRegisteredThemes(host.sessionStore.getRegisteredThemes());
    initTheme(host.settingsManager.getTheme(), true);
    host.customTuiRenderer = createTuiRenderer(host, {
        submitInput: (text) => host.sessionStore.prompt(text),
        abort: () => host.handleCtrlC(),
        newSession: () => host.handleClearCommand(),
        resumeSession: (sessionPath, resumeOptions) => host.handleResumeSession(sessionPath, resumeOptions),
        forkSession: (entryId, forkOptions) => host.runtimeHost.fork(entryId, forkOptions),
    });
}
