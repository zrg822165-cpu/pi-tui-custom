import * as path from "node:path";
import { getProviders } from "@mariozechner/pi-ai";
import { Container, Loader, Spacer, Text } from "@mariozechner/pi-tui";
import { AssistantMessageComponent, DynamicBorder, ExtensionEditorComponent, ExtensionInputComponent, ExtensionSelectorComponent, LoginDialogComponent, ModelSelectorComponent, OAuthSelectorComponent, ScopedModelsSelectorComponent, SessionSelectorComponent, SettingsSelectorComponent, TreeSelectorComponent, UserMessageSelectorComponent } from "../tui-renderer/index.mjs";
import { keyText } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/keybinding-hints.js";
import { getDocsPath, getAuthPath } from "../node_modules/@mariozechner/pi-coding-agent/dist/config.js";
import { defaultModelPerProvider, findExactModelReferenceMatch, resolveModelScope } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/model-resolver.js";
import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/provider-display-names.js";
import { SessionManager } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js";
import { getAvailableThemes, setTheme, setThemeInstance, Theme, theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export const BEDROCK_PROVIDER_ID = "amazon-bedrock";
export const ANTHROPIC_SUBSCRIPTION_AUTH_WARNING = "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage.";
export const BUILT_IN_MODEL_PROVIDERS = new Set(getProviders());

export function isApiKeyLoginProvider(providerId, oauthProviderIds, builtInProviderIds = BUILT_IN_MODEL_PROVIDERS) {
    if (BUILT_IN_PROVIDER_DISPLAY_NAMES[providerId]) {
        return true;
    }
    if (builtInProviderIds.has(providerId)) {
        return false;
    }
    return !oauthProviderIds.has(providerId);
}

function isUnknownModel(model) {
    return !!model && model.provider === "unknown" && model.id === "unknown" && model.api === "unknown";
}

function hasDefaultModelProvider(providerId) {
    return providerId in defaultModelPerProvider;
}

function isAnthropicSubscriptionAuthKey(apiKey) {
    return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}

export function showSelector(host, create) {
    const done = () => {
        host.rendererHost.setEditorComponent(host.editor);
    };
    const { component, focus } = create(done);
    host.rendererHost.setEditorComponent(component, { focus: false });
    host.rendererHost.setFocus(focus);
    host.rendererHost.requestRender();
}

export function showSettingsSelector(host) {
    showSelector(host, (done) => {
        const selector = new SettingsSelectorComponent({
            autoCompact: host.sessionStore.getAutoCompactionEnabled(),
            showImages: host.settingsManager.getShowImages(),
            imageWidthCells: host.settingsManager.getImageWidthCells(),
            autoResizeImages: host.settingsManager.getImageAutoResize(),
            blockImages: host.settingsManager.getBlockImages(),
            enableSkillCommands: host.settingsManager.getEnableSkillCommands(),
            steeringMode: host.sessionStore.getSteeringMode(),
            followUpMode: host.sessionStore.getFollowUpMode(),
            transport: host.settingsManager.getTransport(),
            thinkingLevel: host.sessionStore.getThinkingLevel(),
            availableThinkingLevels: host.sessionStore.getAvailableThinkingLevels(),
            currentTheme: host.settingsManager.getTheme() || "dark",
            availableThemes: getAvailableThemes(),
            hideThinkingBlock: host.hideThinkingBlock,
            collapseChangelog: host.settingsManager.getCollapseChangelog(),
            enableInstallTelemetry: host.settingsManager.getEnableInstallTelemetry(),
            doubleEscapeAction: host.settingsManager.getDoubleEscapeAction(),
            treeFilterMode: host.settingsManager.getTreeFilterMode(),
            showHardwareCursor: host.settingsManager.getShowHardwareCursor(),
            editorPaddingX: host.settingsManager.getEditorPaddingX(),
            autocompleteMaxVisible: host.settingsManager.getAutocompleteMaxVisible(),
            quietStartup: host.settingsManager.getQuietStartup(),
            clearOnShrink: host.settingsManager.getClearOnShrink(),
            showTerminalProgress: host.settingsManager.getShowTerminalProgress(),
            warnings: host.settingsManager.getWarnings(),
        }, {
            onAutoCompactChange: (enabled) => {
                host.sessionStore.setAutoCompactionEnabled(enabled);
                host.footer.setAutoCompactEnabled(enabled);
            },
            onShowImagesChange: (enabled) => {
                host.settingsManager.setShowImages(enabled);
                host.toolFlowStore.setShowImages(enabled);
            },
            onImageWidthCellsChange: (width) => {
                host.settingsManager.setImageWidthCells(width);
                host.toolFlowStore.setImageWidthCells(width);
            },
            onAutoResizeImagesChange: (enabled) => {
                host.settingsManager.setImageAutoResize(enabled);
            },
            onBlockImagesChange: (blocked) => {
                host.settingsManager.setBlockImages(blocked);
            },
            onEnableSkillCommandsChange: (enabled) => {
                host.settingsManager.setEnableSkillCommands(enabled);
                host.setupAutocompleteProvider();
            },
            onSteeringModeChange: (mode) => {
                host.sessionStore.setSteeringMode(mode);
            },
            onFollowUpModeChange: (mode) => {
                host.sessionStore.setFollowUpMode(mode);
            },
            onTransportChange: (transport) => {
                host.settingsManager.setTransport(transport);
                host.sessionStore.setTransport(transport);
            },
            onThinkingLevelChange: (level) => {
                host.sessionStore.setThinkingLevel(level);
                host.footer.invalidate();
                host.updateEditorBorderColor();
            },
            onThemeChange: (themeName) => {
                const result = setTheme(themeName, true);
                host.settingsManager.setTheme(themeName);
                host.ui.invalidate();
                if (!result.success) {
                    host.showError(`Failed to load theme "${themeName}": ${result.error}\nFell back to dark theme.`);
                }
            },
            onThemePreview: (themeName) => {
                const result = setTheme(themeName, true);
                if (result.success) {
                    host.ui.invalidate();
                    host.ui.requestRender();
                }
            },
            onHideThinkingBlockChange: (hidden) => {
                host.hideThinkingBlock = hidden;
                host.settingsManager.setHideThinkingBlock(hidden);
                host.rendererHost.forEachChatChild((child) => {
                    if (child instanceof AssistantMessageComponent) {
                        child.setHideThinkingBlock(hidden);
                    }
                });
                host.rendererHost.clearChat();
                host.rebuildChatFromMessages();
            },
            onCollapseChangelogChange: (collapsed) => host.settingsManager.setCollapseChangelog(collapsed),
            onEnableInstallTelemetryChange: (enabled) => host.settingsManager.setEnableInstallTelemetry(enabled),
            onQuietStartupChange: (enabled) => host.settingsManager.setQuietStartup(enabled),
            onDoubleEscapeActionChange: (action) => host.settingsManager.setDoubleEscapeAction(action),
            onTreeFilterModeChange: (mode) => host.settingsManager.setTreeFilterMode(mode),
            onShowHardwareCursorChange: (enabled) => {
                host.settingsManager.setShowHardwareCursor(enabled);
                host.ui.setShowHardwareCursor(enabled);
            },
            onEditorPaddingXChange: (padding) => {
                host.settingsManager.setEditorPaddingX(padding);
                host.defaultEditor.setPaddingX(padding);
                if (host.editor !== host.defaultEditor && host.editor.setPaddingX !== undefined) {
                    host.editor.setPaddingX(padding);
                }
            },
            onAutocompleteMaxVisibleChange: (maxVisible) => {
                host.settingsManager.setAutocompleteMaxVisible(maxVisible);
                host.defaultEditor.setAutocompleteMaxVisible(maxVisible);
                if (host.editor !== host.defaultEditor && host.editor.setAutocompleteMaxVisible !== undefined) {
                    host.editor.setAutocompleteMaxVisible(maxVisible);
                }
            },
            onClearOnShrinkChange: (enabled) => {
                host.settingsManager.setClearOnShrink(enabled);
                host.ui.setClearOnShrink(enabled);
            },
            onShowTerminalProgressChange: (enabled) => host.settingsManager.setShowTerminalProgress(enabled),
            onWarningsChange: (warnings) => host.settingsManager.setWarnings(warnings),
            onCancel: () => {
                done();
                host.ui.requestRender();
            },
        });
        return { component: selector, focus: selector.getSettingsList() };
    });
}

export async function updateAvailableProviderCount(host) {
    const models = await getModelCandidates(host);
    const uniqueProviders = new Set(models.map((m) => m.provider));
    host.footerDataProvider.setAvailableProviderCount(uniqueProviders.size);
}

export async function maybeWarnAboutAnthropicSubscriptionAuth(host, model = host.sessionStore.getCurrentModel()) {
    if (host.settingsManager.getWarnings().anthropicExtraUsage === false) {
        return;
    }
    if (host.anthropicSubscriptionWarningShown) {
        return;
    }
    if (!model || model.provider !== "anthropic") {
        return;
    }
    const storedCredential = host.sessionStore.getProviderAuthStorage().get("anthropic");
    if (storedCredential?.type === "oauth") {
        host.anthropicSubscriptionWarningShown = true;
        host.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
        return;
    }
    try {
        const apiKey = await host.sessionStore.getApiKeyForProvider(model.provider);
        if (!isAnthropicSubscriptionAuthKey(apiKey)) {
            return;
        }
        host.anthropicSubscriptionWarningShown = true;
        host.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
    }
    catch {
        // Ignore auth lookup failures for warning-only checks.
    }
}

export function showModelSelector(host, initialSearchInput) {
    showSelector(host, (done) => {
        const selector = new ModelSelectorComponent(host.ui, host.sessionStore.getCurrentModel(), host.settingsManager, host.sessionStore.getModelRegistry(), host.sessionStore.getScopedModels(), async (model) => {
            try {
                await host.sessionStore.setModel(model);
                host.footer.invalidate();
                host.updateEditorBorderColor();
                done();
                host.showStatus(`Model: ${model.id}`);
                void maybeWarnAboutAnthropicSubscriptionAuth(host, model);
                host.checkDaxnutsEasterEgg(model);
            }
            catch (error) {
                done();
                host.showError(error instanceof Error ? error.message : String(error));
            }
        }, () => {
            done();
            host.ui.requestRender();
        }, initialSearchInput);
        return { component: selector, focus: selector };
    });
}

export async function showModelsSelector(host) {
    host.sessionStore.refreshModelRegistry();
    const allModels = host.sessionStore.getAvailableModels();
    if (allModels.length === 0) {
        host.showStatus("No models available");
        return;
    }
    const sessionScopedModels = host.sessionStore.getScopedModels();
    const hasSessionScope = sessionScopedModels.length > 0;
    let currentEnabledIds = null;
    if (hasSessionScope) {
        currentEnabledIds = sessionScopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
    }
    else {
        const patterns = host.settingsManager.getEnabledModels();
        if (patterns !== undefined && patterns.length > 0) {
            const scopedModels = await resolveModelScope(patterns, host.sessionStore.getModelRegistry());
            currentEnabledIds = scopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
        }
    }
    const updateSessionModels = async (enabledIds) => {
        currentEnabledIds = enabledIds === null ? null : [...enabledIds];
        if (enabledIds && enabledIds.length > 0 && enabledIds.length < allModels.length) {
            const newScopedModels = await resolveModelScope(enabledIds, host.sessionStore.getModelRegistry());
            host.sessionStore.setScopedModels(newScopedModels.map((sm) => ({
                model: sm.model,
                thinkingLevel: sm.thinkingLevel,
            })));
        }
        else {
            host.sessionStore.setScopedModels([]);
        }
        await updateAvailableProviderCount(host);
        host.ui.requestRender();
    };
    showSelector(host, (done) => {
        const selector = new ScopedModelsSelectorComponent({
            allModels,
            enabledModelIds: currentEnabledIds,
        }, {
            onChange: async (enabledIds) => {
                await updateSessionModels(enabledIds);
            },
            onPersist: (enabledIds) => {
                const newPatterns = enabledIds === null || enabledIds.length === allModels.length
                    ? undefined
                    : enabledIds;
                host.settingsManager.setEnabledModels(newPatterns ? [...newPatterns] : undefined);
                host.showStatus("Model selection saved to settings");
            },
            onCancel: () => {
                done();
                host.ui.requestRender();
            },
        });
        return { component: selector, focus: selector };
    });
}

export async function handleModelCommand(host, searchTerm) {
    if (!searchTerm) {
        showModelSelector(host);
        return;
    }
    const model = await findExactModelMatch(host, searchTerm);
    if (model) {
        try {
            await host.sessionStore.setModel(model);
            host.footer.invalidate();
            host.updateEditorBorderColor();
            host.showStatus(`Model: ${model.id}`);
            void maybeWarnAboutAnthropicSubscriptionAuth(host, model);
            host.checkDaxnutsEasterEgg(model);
        }
        catch (error) {
            host.showError(error instanceof Error ? error.message : String(error));
        }
        return;
    }
    showModelSelector(host, searchTerm);
}

export async function findExactModelMatch(host, searchTerm) {
    const models = await getModelCandidates(host);
    return findExactModelReferenceMatch(searchTerm, models);
}

export async function getModelCandidates(host) {
    if (host.sessionStore.hasScopedModels()) {
        return host.sessionStore.getScopedModelValues();
    }
    host.sessionStore.refreshModelRegistry();
    try {
        return await host.sessionStore.getAvailableModels();
    }
    catch {
        return [];
    }
}

export function showUserMessageSelector(host) {
    const userMessages = host.sessionStore.getUserMessagesForForking();
    if (userMessages.length === 0) {
        host.showStatus("No messages to fork from");
        return;
    }
    const initialSelectedId = userMessages[userMessages.length - 1]?.entryId;
    showSelector(host, (done) => {
        const selector = new UserMessageSelectorComponent(userMessages.map((m) => ({ id: m.entryId, text: m.text })), async (entryId) => {
            try {
                const result = await host.runtimeHost.fork(entryId);
                if (result.cancelled) {
                    done();
                    host.ui.requestRender();
                    return;
                }
                host.renderCurrentSessionState();
                host.editor.setText(result.selectedText ?? "");
                done();
                host.showStatus("Forked to new session");
            }
            catch (error) {
                done();
                host.showError(error instanceof Error ? error.message : String(error));
            }
        }, () => {
            done();
            host.ui.requestRender();
        }, initialSelectedId);
        return { component: selector, focus: selector.getMessageList() };
    });
}

export function showTreeSelector(host, initialSelectedId) {
    const tree = host.sessionStore.getTree();
    const realLeafId = host.sessionStore.getLeafId();
    const initialFilterMode = host.settingsManager.getTreeFilterMode();
    if (tree.length === 0) {
        host.showStatus("No entries in session");
        return;
    }
    showSelector(host, (done) => {
        const selector = new TreeSelectorComponent(tree, realLeafId, host.ui.terminal.rows, async (entryId) => {
            if (entryId === realLeafId) {
                done();
                host.showStatus("Already at this point");
                return;
            }
            done();
            let wantsSummary = false;
            let customInstructions;
            if (!host.settingsManager.getBranchSummarySkipPrompt()) {
                while (true) {
                    const summaryChoice = await host.showExtensionSelector("Summarize branch?", [
                        "No summary",
                        "Summarize",
                        "Summarize with custom prompt",
                    ]);
                    if (summaryChoice === undefined) {
                        showTreeSelector(host, entryId);
                        return;
                    }
                    wantsSummary = summaryChoice !== "No summary";
                    if (summaryChoice === "Summarize with custom prompt") {
                        customInstructions = await host.showExtensionEditor("Custom summarization instructions");
                        if (customInstructions === undefined) {
                            continue;
                        }
                    }
                    break;
                }
            }
            let summaryLoader;
            const originalOnEscape = host.defaultEditor.onEscape;
            if (wantsSummary) {
                host.defaultEditor.onEscape = () => host.sessionStore.abortBranchSummary();
                host.rendererHost.appendChat(new Spacer(1));
                summaryLoader = new Loader(host.ui, (spinner) => theme.fg("accent", spinner), (text) => theme.fg("muted", text), `Summarizing branch... (${keyText("app.interrupt")} to cancel)`);
                host.rendererHost.appendStatus(summaryLoader);
                host.ui.requestRender();
            }
            try {
                const result = await host.sessionStore.navigateTree(entryId, {
                    summarize: wantsSummary,
                    customInstructions,
                });
                if (result.aborted) {
                    host.showStatus("Branch summarization cancelled");
                    showTreeSelector(host, entryId);
                    return;
                }
                if (result.cancelled) {
                    host.showStatus("Navigation cancelled");
                    return;
                }
                host.rendererHost.clearChat();
                host.renderInitialMessages();
                if (result.editorText && !host.editor.getText().trim()) {
                    host.editor.setText(result.editorText);
                }
                host.showStatus("Navigated to selected point");
                void host.flushCompactionQueue({ willRetry: false });
            }
            catch (error) {
                host.showError(error instanceof Error ? error.message : String(error));
            }
            finally {
                if (summaryLoader) {
                    summaryLoader.stop();
                    host.rendererHost.clearStatus();
                }
                host.defaultEditor.onEscape = originalOnEscape;
            }
        }, () => {
            done();
            host.ui.requestRender();
        }, (entryId, label) => {
            host.sessionStore.appendLabelChange(entryId, label);
            host.ui.requestRender();
        }, initialSelectedId, initialFilterMode);
        return { component: selector, focus: selector };
    });
}

export function showSessionSelector(host) {
    showSelector(host, (done) => {
        const selector = new SessionSelectorComponent((onProgress) => SessionManager.list(host.sessionStore.getCwd(), host.sessionStore.getSessionDir(), onProgress), SessionManager.listAll, async (sessionPath) => {
            done();
            await host.handleResumeSession(sessionPath);
        }, () => {
            done();
            host.ui.requestRender();
        }, () => {
            void host.shutdown();
        }, () => host.ui.requestRender(), {
            renameSession: async (sessionFilePath, nextName) => {
                const next = (nextName ?? "").trim();
                if (!next) {
                    return;
                }
                const mgr = SessionManager.open(sessionFilePath);
                mgr.appendSessionInfo(next);
            },
            showRenameHint: true,
            keybindings: host.keybindings,
        }, host.sessionStore.getSessionFile());
        return { component: selector, focus: selector };
    });
}

export function getLoginProviderOptions(host, authType) {
    const oauthProviderIds = new Set(host.sessionStore.getProviderAuthStorage().getOAuthProviders().map((provider) => provider.id));
    const providers = [];
    for (const provider of host.sessionStore.getProviderAuthStorage().getOAuthProviders()) {
        providers.push({
            id: provider.id,
            name: provider.name,
            authType: "oauth",
        });
    }
    const modelProviders = new Set(host.sessionStore.getAllModels().map((model) => model.provider));
    for (const providerId of modelProviders) {
        if (!isApiKeyLoginProvider(providerId, oauthProviderIds)) {
            continue;
        }
        providers.push({
            id: providerId,
            name: host.sessionStore.getProviderDisplayName(providerId),
            authType: "api_key",
        });
    }
    const filtered = authType ? providers.filter((option) => option.authType === authType) : providers;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

export function getLogoutProviderOptions(host) {
    const authStorage = host.sessionStore.getProviderAuthStorage();
    const options = [];
    for (const providerId of authStorage.list()) {
        const credential = authStorage.get(providerId);
        if (!credential) {
            continue;
        }
        options.push({
            id: providerId,
            name: host.sessionStore.getProviderDisplayName(providerId),
            authType: credential.type,
        });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
}

export function showLoginAuthTypeSelector(host) {
    const subscriptionLabel = "Use a subscription";
    const apiKeyLabel = "Use an API key";
    showSelector(host, (done) => {
        const selector = new ExtensionSelectorComponent("Select authentication method:", [subscriptionLabel, apiKeyLabel], (option) => {
            done();
            const authType = option === subscriptionLabel ? "oauth" : "api_key";
            showLoginProviderSelector(host, authType);
        }, () => {
            done();
            host.ui.requestRender();
        });
        return { component: selector, focus: selector };
    });
}

export function showLoginProviderSelector(host, authType) {
    const providerOptions = getLoginProviderOptions(host, authType);
    if (providerOptions.length === 0) {
        host.showStatus(authType === "oauth" ? "No subscription providers available." : "No API key providers available.");
        return;
    }
    showSelector(host, (done) => {
        const selector = new OAuthSelectorComponent("login", host.sessionStore.getProviderAuthStorage(), providerOptions, async (providerId) => {
            done();
            const providerOption = providerOptions.find((provider) => provider.id === providerId);
            if (!providerOption) {
                return;
            }
            if (providerOption.authType === "oauth") {
                await showLoginDialog(host, providerOption.id, providerOption.name);
            }
            else if (providerOption.id === BEDROCK_PROVIDER_ID) {
                showBedrockSetupDialog(host, providerOption.id, providerOption.name);
            }
            else {
                await showApiKeyLoginDialog(host, providerOption.id, providerOption.name);
            }
        }, () => {
            done();
            showLoginAuthTypeSelector(host);
        }, (providerId) => host.sessionStore.getProviderAuthStatus(providerId));
        return { component: selector, focus: selector };
    });
}

export function showOAuthSelector(host, mode) {
    if (mode === "login") {
        showLoginAuthTypeSelector(host);
        return;
    }
    const providerOptions = getLogoutProviderOptions(host);
    if (providerOptions.length === 0) {
        host.showStatus("No stored credentials to remove. /logout only removes credentials saved by /login; environment variables and models.json config are unchanged.");
        return;
    }
    showSelector(host, (done) => {
        const selector = new OAuthSelectorComponent(mode, host.sessionStore.getProviderAuthStorage(), providerOptions, async (providerId) => {
            done();
            const providerOption = providerOptions.find((provider) => provider.id === providerId);
            if (!providerOption) {
                return;
            }
            try {
                host.sessionStore.getProviderAuthStorage().logout(providerOption.id);
                host.sessionStore.refreshModelRegistry();
                await updateAvailableProviderCount(host);
                const message = providerOption.authType === "oauth"
                    ? `Logged out of ${providerOption.name}`
                    : `Removed stored API key for ${providerOption.name}. Environment variables and models.json config are unchanged.`;
                host.showStatus(message);
            }
            catch (error) {
                host.showError(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }, () => {
            done();
            host.ui.requestRender();
        });
        return { component: selector, focus: selector };
    });
}

export async function completeProviderAuthentication(host, providerId, providerName, authType, previousModel) {
    host.sessionStore.refreshModelRegistry();
    const actionLabel = authType === "oauth" ? `Logged in to ${providerName}` : `Saved API key for ${providerName}`;
    let selectedModel;
    let selectionError;
    if (isUnknownModel(previousModel)) {
        const availableModels = host.sessionStore.getAvailableModels();
        const providerModels = availableModels.filter((model) => model.provider === providerId);
        if (!hasDefaultModelProvider(providerId)) {
            selectionError = `${actionLabel}, but no default model is configured for provider "${providerId}". Use /model to select a model.`;
        }
        else if (providerModels.length === 0) {
            selectionError = `${actionLabel}, but no models are available for that provider. Use /model to select a model.`;
        }
        else {
            const defaultModelId = defaultModelPerProvider[providerId];
            selectedModel = providerModels.find((model) => model.id === defaultModelId);
            if (!selectedModel) {
                selectionError = `${actionLabel}, but its default model "${defaultModelId}" is not available. Use /model to select a model.`;
            }
            else {
                try {
                    await host.sessionStore.setModel(selectedModel);
                }
                catch (error) {
                    selectedModel = undefined;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    selectionError = `${actionLabel}, but selecting its default model failed: ${errorMessage}. Use /model to select a model.`;
                }
            }
        }
    }
    await updateAvailableProviderCount(host);
    host.footer.invalidate();
    host.updateEditorBorderColor();
    if (selectedModel) {
        host.showStatus(`${actionLabel}. Selected ${selectedModel.id}. Credentials saved to ${getAuthPath()}`);
        void maybeWarnAboutAnthropicSubscriptionAuth(host, selectedModel);
        host.checkDaxnutsEasterEgg(selectedModel);
    }
    else {
        host.showStatus(`${actionLabel}. Credentials saved to ${getAuthPath()}`);
        if (selectionError) {
            host.showError(selectionError);
        }
        else {
            void maybeWarnAboutAnthropicSubscriptionAuth(host);
        }
    }
}

export function showBedrockSetupDialog(host, providerId, providerName) {
    const restoreEditor = () => {
        host.rendererHost.setEditorComponent(host.editor);
        host.ui.requestRender();
    };
    const dialog = new LoginDialogComponent(host.ui, providerId, () => restoreEditor(), providerName, "Amazon Bedrock setup");
    dialog.showInfo([
        theme.fg("text", "Amazon Bedrock uses AWS credentials instead of a single API key."),
        theme.fg("text", "Configure an AWS profile, IAM keys, bearer token, or role-based credentials."),
        theme.fg("muted", "See:"),
        theme.fg("accent", `  ${path.join(getDocsPath(), "providers.md")}`),
    ]);
    host.rendererHost.setEditorComponent(dialog);
    host.ui.requestRender();
}

export async function showApiKeyLoginDialog(host, providerId, providerName) {
    const previousModel = host.sessionStore.getCurrentModel();
    const dialog = new LoginDialogComponent(host.ui, providerId, (_success, _message) => {
        // Completion handled below
    }, providerName);
    host.rendererHost.setEditorComponent(dialog);
    host.ui.requestRender();
    const restoreEditor = () => {
        host.rendererHost.setEditorComponent(host.editor);
        host.ui.requestRender();
    };
    try {
        const apiKey = (await dialog.showPrompt("Enter API key:")).trim();
        if (!apiKey) {
            throw new Error("API key cannot be empty.");
        }
        host.sessionStore.getProviderAuthStorage().set(providerId, { type: "api_key", key: apiKey });
        restoreEditor();
        await completeProviderAuthentication(host, providerId, providerName, "api_key", previousModel);
    }
    catch (error) {
        restoreEditor();
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg !== "Login cancelled") {
            host.showError(`Failed to save API key for ${providerName}: ${errorMsg}`);
        }
    }
}

export async function showLoginDialog(host, providerId, providerName) {
    const providerInfo = host.sessionStore.getProviderAuthStorage()
        .getOAuthProviders()
        .find((provider) => provider.id === providerId);
    const previousModel = host.sessionStore.getCurrentModel();
    const usesCallbackServer = providerInfo?.usesCallbackServer ?? false;
    const dialog = new LoginDialogComponent(host.ui, providerId, (_success, _message) => {
        // Completion handled below
    }, providerName);
    host.rendererHost.setEditorComponent(dialog);
    host.ui.requestRender();
    let manualCodeResolve;
    let manualCodeReject;
    const manualCodePromise = new Promise((resolve, reject) => {
        manualCodeResolve = resolve;
        manualCodeReject = reject;
    });
    const restoreEditor = () => {
        host.rendererHost.setEditorComponent(host.editor);
        host.ui.requestRender();
    };
    try {
        await host.sessionStore.getProviderAuthStorage().login(providerId, {
            onAuth: (info) => {
                dialog.showAuth(info.url, info.instructions);
                if (usesCallbackServer) {
                    dialog
                        .showManualInput("Paste redirect URL below, or complete login in browser:")
                        .then((value) => {
                        if (value && manualCodeResolve) {
                            manualCodeResolve(value);
                            manualCodeResolve = undefined;
                        }
                    })
                        .catch(() => {
                        if (manualCodeReject) {
                            manualCodeReject(new Error("Login cancelled"));
                            manualCodeReject = undefined;
                        }
                    });
                }
                else if (providerId === "github-copilot") {
                    dialog.showWaiting("Waiting for browser authentication...");
                }
            },
            onPrompt: async (prompt) => dialog.showPrompt(prompt.message, prompt.placeholder),
            onProgress: (message) => dialog.showProgress(message),
            onManualCodeInput: () => manualCodePromise,
            signal: dialog.signal,
        });
        restoreEditor();
        await completeProviderAuthentication(host, providerId, providerName, "oauth", previousModel);
    }
    catch (error) {
        restoreEditor();
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg !== "Login cancelled") {
            host.showError(`Failed to login to ${providerName}: ${errorMsg}`);
        }
    }
}
