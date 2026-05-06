import { matchesKey } from "@mariozechner/pi-tui";
import { keyText } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/keybinding-hints.js";
import { getAvailableThemesWithPaths, getThemeByName, setRegisteredThemes, setTheme, setThemeInstance, Theme, theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

function isExpandable(obj) {
    return obj && typeof obj.setExpanded === "function";
}

export function setupExtensionShortcuts(host, extensionRunner) {
    const shortcuts = extensionRunner.getShortcuts(host.keybindings.getEffectiveConfig());
    if (shortcuts.size === 0)
        return;
    const createContext = () => ({
        ui: host.createExtensionUIContext(),
        hasUI: true,
        cwd: host.sessionStore.getCwd(),
        sessionManager: host.sessionStore.getSessionManagerAdapter(),
        modelRegistry: host.sessionStore.getModelRegistry(),
        model: host.sessionStore.getCurrentModel(),
        isIdle: () => host.sessionStore.isIdle(),
        signal: host.sessionStore.getSignal(),
        abort: () => host.sessionStore.abort(),
        hasPendingMessages: () => host.sessionStore.hasPendingMessages(),
        shutdown: () => {
            host.shutdownRequested = true;
        },
        getContextUsage: () => host.sessionStore.getContextUsage(),
        compact: (options) => {
            void (async () => {
                try {
                    const result = await host.sessionStore.compact(options?.customInstructions);
                    options?.onComplete?.(result);
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    options?.onError?.(err);
                }
            })();
        },
        getSystemPrompt: () => host.sessionStore.getSystemPrompt(),
    });
    host.defaultEditor.onExtensionShortcut = (data) => {
        for (const [shortcutStr, shortcut] of shortcuts) {
            if (matchesKey(data, shortcutStr)) {
                Promise.resolve(shortcut.handler(createContext())).catch((err) => {
                    host.showError(`Shortcut handler error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }
        }
        return false;
    };
}

export function resetExtensionUI(host) {
    if (host.extensionSelector) {
        host.hideExtensionSelector();
    }
    if (host.extensionInput) {
        host.hideExtensionInput();
    }
    if (host.extensionEditor) {
        host.hideExtensionEditor();
    }
    host.ui.hideOverlay();
    host.clearExtensionTerminalInputListeners();
    host.setExtensionFooter(undefined);
    host.setExtensionHeader(undefined);
    host.clearExtensionWidgets();
    host.footerDataProvider.clearExtensionStatuses();
    host.footer.invalidate();
    host.autocompleteProviderWrappers = [];
    host.setCustomEditorComponent(undefined);
    host.setupAutocompleteProvider();
    host.defaultEditor.onExtensionShortcut = undefined;
    host.updateTerminalTitle();
    host.workingMessage = undefined;
    host.workingVisible = true;
    host.setWorkingIndicator();
    if (host.loadingAnimation) {
        host.loadingAnimation.setMessage(`${host.defaultWorkingMessage} (${keyText("app.interrupt")} to interrupt)`);
    }
    host.setHiddenThinkingLabel();
}

export function setExtensionFooter(host, factory) {
    if (host.customFooter?.dispose) {
        host.customFooter.dispose();
    }
    if (factory) {
        host.customFooter = factory(host.ui, theme, host.footerDataProvider);
        host.rendererHost.setFooter(host.customFooter);
    }
    else {
        host.customFooter = undefined;
        host.rendererHost.setFooter(host.footer);
    }
    host.ui.requestRender();
}

export function setExtensionHeader(host, factory) {
    if (!host.builtInHeader) {
        return;
    }
    if (host.customHeader?.dispose) {
        host.customHeader.dispose();
    }
    const currentHeader = host.customHeader || host.builtInHeader;
    if (factory) {
        host.customHeader = factory(host.ui, theme);
        if (isExpandable(host.customHeader)) {
            host.customHeader.setExpanded(host.toolOutputExpanded);
        }
        host.rendererHost.replaceHeaderComponent(currentHeader, host.customHeader);
    }
    else {
        host.customHeader = undefined;
        if (isExpandable(host.builtInHeader)) {
            host.builtInHeader.setExpanded(host.toolOutputExpanded);
        }
        host.rendererHost.replaceHeaderComponent(currentHeader, host.builtInHeader);
    }
    host.ui.requestRender();
}

export function createExtensionUIContext(host) {
    return {
        select: (title, options, opts) => host.showExtensionSelector(title, options, opts),
        confirm: (title, message, opts) => host.showExtensionConfirm(title, message, opts),
        input: (title, placeholder, opts) => host.showExtensionInput(title, placeholder, opts),
        notify: (message, type) => host.showExtensionNotify(message, type),
        onTerminalInput: (handler) => host.addExtensionTerminalInputListener(handler),
        setStatus: (key, text) => host.setExtensionStatus(key, text),
        setWorkingMessage: (message) => {
            host.workingMessage = message;
            if (host.loadingAnimation) {
                host.loadingAnimation.setMessage(message ?? host.defaultWorkingMessage);
            }
        },
        setWorkingVisible: (visible) => host.setWorkingVisible(visible),
        setWorkingIndicator: (options) => host.setWorkingIndicator(options),
        setHiddenThinkingLabel: (label) => host.setHiddenThinkingLabel(label),
        setWidget: (key, content, options) => host.setExtensionWidget(key, content, options),
        setFooter: (factory) => host.setExtensionFooter(factory),
        setHeader: (factory) => host.setExtensionHeader(factory),
        setTitle: (title) => host.ui.terminal.setTitle(title),
        custom: (factory, options) => host.showExtensionCustom(factory, options),
        pasteToEditor: (text) => host.editor.handleInput(`\x1b[200~${text}\x1b[201~`),
        setEditorText: (text) => host.editor.setText(text),
        getEditorText: () => host.editor.getExpandedText?.() ?? host.editor.getText(),
        editor: (title, prefill) => host.showExtensionEditor(title, prefill),
        addAutocompleteProvider: (factory) => {
            host.autocompleteProviderWrappers.push(factory);
            host.setupAutocompleteProvider();
        },
        setEditorComponent: (factory) => host.setCustomEditorComponent(factory),
        getEditorComponent: () => host.editorComponentFactory,
        get theme() {
            return theme;
        },
        getAllThemes: () => getAvailableThemesWithPaths(),
        getTheme: (name) => getThemeByName(name),
        setTheme: (themeOrName) => {
            if (themeOrName instanceof Theme) {
                setThemeInstance(themeOrName);
                host.ui.requestRender();
                return { success: true };
            }
            const result = setTheme(themeOrName, true);
            if (result.success) {
                if (host.settingsManager.getTheme() !== themeOrName) {
                    host.settingsManager.setTheme(themeOrName);
                }
                host.ui.requestRender();
            }
            return result;
        },
        getToolsExpanded: () => host.toolOutputExpanded,
        setToolsExpanded: (expanded) => host.setToolsExpanded(expanded),
    };
}

export async function bindCurrentSessionExtensions(host) {
    const uiContext = host.createExtensionUIContext();
    await host.sessionStore.bindExtensions({
        uiContext,
        commandContextActions: {
            waitForIdle: () => host.sessionStore.waitForIdle(),
            newSession: async (options) => {
                if (host.loadingAnimation) {
                    host.loadingAnimation.stop();
                    host.loadingAnimation = undefined;
                }
                host.rendererHost.clearStatus();
                try {
                    const result = await host.runtimeHost.newSession(options);
                    if (!result.cancelled) {
                        host.renderCurrentSessionState();
                        host.ui.requestRender();
                    }
                    return result;
                }
                catch (error) {
                    return host.handleFatalRuntimeError("Failed to create session", error);
                }
            },
            fork: async (entryId, options) => {
                try {
                    const result = await host.runtimeHost.fork(entryId, options);
                    if (!result.cancelled) {
                        host.renderCurrentSessionState();
                        host.editor.setText(result.selectedText ?? "");
                        host.showStatus("Forked to new session");
                    }
                    return { cancelled: result.cancelled };
                }
                catch (error) {
                    return host.handleFatalRuntimeError("Failed to fork session", error);
                }
            },
            navigateTree: async (targetId, options) => {
                const result = await host.sessionStore.navigateTree(targetId, {
                    summarize: options?.summarize,
                    customInstructions: options?.customInstructions,
                    replaceInstructions: options?.replaceInstructions,
                    label: options?.label,
                });
                if (result.cancelled) {
                    return { cancelled: true };
                }
                host.rendererHost.clearChat();
                host.renderInitialMessages();
                if (result.editorText && !host.editor.getText().trim()) {
                    host.editor.setText(result.editorText);
                }
                host.showStatus("Navigated to selected point");
                void host.flushCompactionQueue({ willRetry: false });
                return { cancelled: false };
            },
            switchSession: async (sessionPath, options) => {
                return host.handleResumeSession(sessionPath, options);
            },
            reload: async () => {
                await host.handleReloadCommand();
            },
        },
        shutdownHandler: () => {
            host.shutdownRequested = true;
            if (host.sessionStore.isIdle()) {
                void host.shutdown();
            }
        },
        onError: (error) => {
            host.showExtensionError(error.extensionPath, error.error, error.stack);
        },
    });
    setRegisteredThemes(host.sessionStore.getRegisteredThemes());
    host.setupAutocompleteProvider();
    const extensionRunner = host.sessionStore.getExtensionRunner();
    host.setupExtensionShortcuts(extensionRunner);
    host.showLoadedResources({ force: false, showDiagnosticsWhenQuiet: true });
    host.showStartupNoticesIfNeeded();
}
