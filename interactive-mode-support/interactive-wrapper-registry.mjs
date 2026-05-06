import { handleInteractiveHostEvent } from "../event-state-runtime/index.mjs";
import * as commandControllerAdapter from "./command-controller-adapter.mjs";
import * as externalEditorAdapter from "./external-editor-adapter.mjs";
import * as hostFacadeAdapter from "./host-facade-adapter.mjs";
import * as inputControllerAdapter from "./input-controller-adapter.mjs";
import * as modeStateControllerAdapter from "./mode-state-controller-adapter.mjs";
import * as processLifecycleAdapter from "./process-lifecycle-adapter.mjs";
import * as queueInteractionAdapter from "./queue-interaction-adapter.mjs";
import * as selectorControllerAdapter from "./selector-controller-adapter.mjs";
import * as sessionNavigationAdapter from "./session-navigation-adapter.mjs";

const WRAPPERS = {
    setupKeyHandlers() {
        inputControllerAdapter.setupKeyHandlers(this);
    },
    async handleClipboardImagePaste() {
        return inputControllerAdapter.handleClipboardImagePaste(this);
    },
    setupEditorSubmitHandler() {
        inputControllerAdapter.setupEditorSubmitHandler(this);
    },
    subscribeToAgent() {
        this.unsubscribe = this.eventStateRuntime.subscribeToSource(this.sessionStore, async (event) => {
            await this.handleEvent(event);
        });
    },
    async handleEvent(event) {
        if (!this.isInitialized) {
            await this.init();
        }
        this.lastEventStateTransition = this.eventStateRuntime.getLastTransition?.();
        try {
            this.customTuiRenderer?.dispatch?.(this.eventStateRuntime.toUiEvent(event, this));
        }
        catch (error) {
            this.lastCustomTuiDispatchError = error;
        }
        this.footer.invalidate();
        if (await handleInteractiveHostEvent(this, event)) {
            return;
        }
    },
    getUserMessageText(message) {
        return hostFacadeAdapter.getUserMessageText(this, message);
    },
    showStatus(message) {
        return hostFacadeAdapter.showStatus(this, message);
    },
    addMessageToChat(message, options) {
        return hostFacadeAdapter.addMessageToChat(this, message, options);
    },
    renderSessionContext(sessionContext, options = {}) {
        return hostFacadeAdapter.renderSessionContext(this, sessionContext, options);
    },
    renderInitialMessages() {
        return hostFacadeAdapter.renderInitialMessages(this);
    },
    async getUserInput() {
        return hostFacadeAdapter.getUserInput(this);
    },
    rebuildChatFromMessages() {
        return hostFacadeAdapter.rebuildChatFromMessages(this);
    },
    handleCtrlC() {
        return inputControllerAdapter.handleCtrlC(this);
    },
    handleCtrlD() {
        return processLifecycleAdapter.handleCtrlD(this);
    },
    async shutdown() {
        return processLifecycleAdapter.shutdown(this);
    },
    async checkShutdownRequested() {
        return processLifecycleAdapter.checkShutdownRequested(this);
    },
    registerSignalHandlers() {
        return processLifecycleAdapter.registerSignalHandlers(this);
    },
    unregisterSignalHandlers() {
        return processLifecycleAdapter.unregisterSignalHandlers(this);
    },
    handleCtrlZ() {
        return processLifecycleAdapter.handleCtrlZ(this);
    },
    async handleFollowUp() {
        return queueInteractionAdapter.handleFollowUp(this);
    },
    handleDequeue() {
        return queueInteractionAdapter.handleDequeue(this);
    },
    updateEditorBorderColor() {
        return modeStateControllerAdapter.updateEditorBorderColor(this);
    },
    cycleThinkingLevel() {
        return modeStateControllerAdapter.cycleThinkingLevel(this);
    },
    async cycleModel(direction) {
        return modeStateControllerAdapter.cycleModel(this, direction);
    },
    toggleToolOutputExpansion() {
        return modeStateControllerAdapter.toggleToolOutputExpansion(this);
    },
    setToolsExpanded(expanded) {
        return modeStateControllerAdapter.setToolsExpanded(this, expanded);
    },
    setThinkingBlockVisibility(hidden) {
        return modeStateControllerAdapter.setThinkingBlockVisibility(this, hidden);
    },
    toggleThinkingBlockVisibility() {
        return modeStateControllerAdapter.toggleThinkingBlockVisibility(this);
    },
    openExternalEditor() {
        return externalEditorAdapter.openExternalEditor(this);
    },
    clearEditor() {
        return hostFacadeAdapter.clearEditor(this);
    },
    showError(errorMessage) {
        return hostFacadeAdapter.showError(this, errorMessage);
    },
    shouldShowTerminalProgress() {
        return hostFacadeAdapter.shouldShowTerminalProgress(this);
    },
    hasRetryEscapeHandler() {
        return hostFacadeAdapter.hasRetryEscapeHandler(this);
    },
    hasRetryCountdown() {
        return hostFacadeAdapter.hasRetryCountdown(this);
    },
    hasRetryLoader() {
        return hostFacadeAdapter.hasRetryLoader(this);
    },
    shouldStartWorkingLoader() {
        return hostFacadeAdapter.shouldStartWorkingLoader(this);
    },
    hasWorkingLoader() {
        return hostFacadeAdapter.hasWorkingLoader(this);
    },
    hasCompactionEscapeHandler() {
        return hostFacadeAdapter.hasCompactionEscapeHandler(this);
    },
    hasCompactionLoader() {
        return hostFacadeAdapter.hasCompactionLoader(this);
    },
    hasStreamingAssistant() {
        return hostFacadeAdapter.hasStreamingAssistant(this);
    },
    hasPendingTool(toolCallId) {
        return hostFacadeAdapter.hasPendingTool(this, toolCallId);
    },
    getRetryAttempt() {
        return hostFacadeAdapter.getRetryAttempt(this);
    },
    invalidateFooter() {
        return hostFacadeAdapter.invalidateFooter(this);
    },
    requestRender() {
        return hostFacadeAdapter.requestRender(this);
    },
    setAssistantActivity(active) {
        return hostFacadeAdapter.setAssistantActivity(this, active);
    },
    setTerminalProgress(active) {
        return hostFacadeAdapter.setTerminalProgress(this, active);
    },
    clearStatusLine() {
        return hostFacadeAdapter.clearStatusLine(this);
    },
    startWorkingLoaderIfVisible() {
        return hostFacadeAdapter.startWorkingLoaderIfVisible(this);
    },
    stopWorkingLoader() {
        return hostFacadeAdapter.stopWorkingLoader(this);
    },
    removeStreamingAssistant() {
        return hostFacadeAdapter.removeStreamingAssistant(this);
    },
    startStreamingAssistant(message) {
        return hostFacadeAdapter.startStreamingAssistant(this, message);
    },
    queueAssistantStreamUpdate(event) {
        return hostFacadeAdapter.queueAssistantStreamUpdate(this, event);
    },
    setStreamingAssistantMessage(message) {
        return hostFacadeAdapter.setStreamingAssistantMessage(this, message);
    },
    setStreamingAbortError(errorMessage) {
        return hostFacadeAdapter.setStreamingAbortError(this, errorMessage);
    },
    updateStreamingAssistantContent() {
        return hostFacadeAdapter.updateStreamingAssistantContent(this);
    },
    finishStreamingAssistant() {
        return hostFacadeAdapter.finishStreamingAssistant(this);
    },
    createPendingToolIfMissing(toolCallId, toolName, args) {
        return hostFacadeAdapter.createPendingToolIfMissing(this, toolCallId, toolName, args);
    },
    attachPendingToolIfReady(toolCallId) {
        return hostFacadeAdapter.attachPendingToolIfReady(this, toolCallId);
    },
    markPendingToolStarted(toolCallId) {
        return hostFacadeAdapter.markPendingToolStarted(this, toolCallId);
    },
    updatePendingToolResult(toolCallId, result, isError) {
        return hostFacadeAdapter.updatePendingToolResult(this, toolCallId, result, isError);
    },
    queuePendingToolUpdate(toolCallId, event) {
        return hostFacadeAdapter.queuePendingToolUpdate(this, toolCallId, event);
    },
    markAllPendingToolsError(errorMessage) {
        return hostFacadeAdapter.markAllPendingToolsError(this, errorMessage);
    },
    finalizePendingToolArgs() {
        return hostFacadeAdapter.finalizePendingToolArgs(this);
    },
    markToolThinkingActivity(activity) {
        return hostFacadeAdapter.markToolThinkingActivity(this, activity);
    },
    setToolThinkingPhase(phase) {
        return hostFacadeAdapter.setToolThinkingPhase(this, phase);
    },
    stopToolThinkingIfVisibleText() {
        return hostFacadeAdapter.stopToolThinkingIfVisibleText(this);
    },
    saveCompactionEscapeHandler() {
        return hostFacadeAdapter.saveCompactionEscapeHandler(this);
    },
    setCompactionAbortHandler() {
        return hostFacadeAdapter.setCompactionAbortHandler(this);
    },
    restoreCompactionEscapeHandler() {
        return hostFacadeAdapter.restoreCompactionEscapeHandler(this);
    },
    showCompactionLoader(reason) {
        return hostFacadeAdapter.showCompactionLoader(this, reason);
    },
    stopCompactionLoader() {
        return hostFacadeAdapter.stopCompactionLoader(this);
    },
    addCompactionSummary(summary, tokensBefore) {
        return hostFacadeAdapter.addCompactionSummary(this, summary, tokensBefore);
    },
    addCompactionError(errorMessage) {
        return hostFacadeAdapter.addCompactionError(this, errorMessage);
    },
    saveRetryEscapeHandler() {
        return hostFacadeAdapter.saveRetryEscapeHandler(this);
    },
    setRetryAbortHandler() {
        return hostFacadeAdapter.setRetryAbortHandler(this);
    },
    restoreRetryEscapeHandler() {
        return hostFacadeAdapter.restoreRetryEscapeHandler(this);
    },
    disposeRetryCountdown() {
        return hostFacadeAdapter.disposeRetryCountdown(this);
    },
    disposeExistingRetryCountdown() {
        return hostFacadeAdapter.disposeExistingRetryCountdown(this);
    },
    stopRetryLoader(options = {}) {
        return hostFacadeAdapter.stopRetryLoader(this, options);
    },
    showRetryLoader({ attempt, maxAttempts, delayMs }) {
        return hostFacadeAdapter.showRetryLoader(this, { attempt, maxAttempts, delayMs });
    },
    showWarning(warningMessage) {
        return hostFacadeAdapter.showWarning(this, warningMessage);
    },
    showNewVersionNotification(newVersion) {
        return hostFacadeAdapter.showNewVersionNotification(this, newVersion);
    },
    showPackageUpdateNotification(packages) {
        return hostFacadeAdapter.showPackageUpdateNotification(this, packages);
    },
    getAllQueuedMessages() {
        return hostFacadeAdapter.getAllQueuedMessages(this);
    },
    clearAllQueues() {
        return hostFacadeAdapter.clearAllQueues(this);
    },
    updatePendingMessagesDisplay() {
        return hostFacadeAdapter.updatePendingMessagesDisplay(this);
    },
    restoreQueuedMessagesToEditor(options) {
        return hostFacadeAdapter.restoreQueuedMessagesToEditor(this, options);
    },
    queueCompactionMessage(text, mode) {
        return hostFacadeAdapter.queueCompactionMessage(this, text, mode);
    },
    isExtensionCommand(text) {
        return hostFacadeAdapter.isExtensionCommand(this, text);
    },
    async flushCompactionQueue(options) {
        return hostFacadeAdapter.flushCompactionQueue(this, options);
    },
    flushPendingBashComponents() {
        return hostFacadeAdapter.flushPendingBashComponents(this);
    },
    showSelector(create) {
        selectorControllerAdapter.showSelector(this, create);
    },
    showSettingsSelector() {
        selectorControllerAdapter.showSettingsSelector(this);
    },
    async handleModelCommand(searchTerm) {
        return selectorControllerAdapter.handleModelCommand(this, searchTerm);
    },
    async findExactModelMatch(searchTerm) {
        return selectorControllerAdapter.findExactModelMatch(this, searchTerm);
    },
    async getModelCandidates() {
        return selectorControllerAdapter.getModelCandidates(this);
    },
    async updateAvailableProviderCount() {
        return selectorControllerAdapter.updateAvailableProviderCount(this);
    },
    async maybeWarnAboutAnthropicSubscriptionAuth(model = this.sessionStore.getCurrentModel()) {
        return selectorControllerAdapter.maybeWarnAboutAnthropicSubscriptionAuth(this, model);
    },
    showModelSelector(initialSearchInput) {
        return selectorControllerAdapter.showModelSelector(this, initialSearchInput);
    },
    async showModelsSelector() {
        return selectorControllerAdapter.showModelsSelector(this);
    },
    showUserMessageSelector() {
        return selectorControllerAdapter.showUserMessageSelector(this);
    },
    async handleCloneCommand() {
        return sessionNavigationAdapter.handleCloneCommand(this);
    },
    showTreeSelector(initialSelectedId) {
        return selectorControllerAdapter.showTreeSelector(this, initialSelectedId);
    },
    showSessionSelector() {
        return selectorControllerAdapter.showSessionSelector(this);
    },
    async handleResumeSession(sessionPath, options) {
        return sessionNavigationAdapter.handleResumeSession(this, sessionPath, options);
    },
    getLoginProviderOptions(authType) {
        return selectorControllerAdapter.getLoginProviderOptions(this, authType);
    },
    getLogoutProviderOptions() {
        return selectorControllerAdapter.getLogoutProviderOptions(this);
    },
    showLoginAuthTypeSelector() {
        return selectorControllerAdapter.showLoginAuthTypeSelector(this);
    },
    showLoginProviderSelector(authType) {
        return selectorControllerAdapter.showLoginProviderSelector(this, authType);
    },
    async showOAuthSelector(mode) {
        return selectorControllerAdapter.showOAuthSelector(this, mode);
    },
    async completeProviderAuthentication(providerId, providerName, authType, previousModel) {
        return selectorControllerAdapter.completeProviderAuthentication(this, providerId, providerName, authType, previousModel);
    },
    showBedrockSetupDialog(providerId, providerName) {
        return selectorControllerAdapter.showBedrockSetupDialog(this, providerId, providerName);
    },
    async showApiKeyLoginDialog(providerId, providerName) {
        return selectorControllerAdapter.showApiKeyLoginDialog(this, providerId, providerName);
    },
    async showLoginDialog(providerId, providerName) {
        return selectorControllerAdapter.showLoginDialog(this, providerId, providerName);
    },
    async handleReloadCommand() {
        return commandControllerAdapter.handleReloadCommand(this);
    },
    async handleExportCommand(text) {
        return commandControllerAdapter.handleExportCommand(this, text);
    },
    getPathCommandArgument(text, command) {
        return commandControllerAdapter.getPathCommandArgument(text, command);
    },
    async handleImportCommand(text) {
        return commandControllerAdapter.handleImportCommand(this, text);
    },
    async handleShareCommand() {
        return commandControllerAdapter.handleShareCommand(this);
    },
    async handleCopyCommand() {
        return commandControllerAdapter.handleCopyCommand(this);
    },
    handleNameCommand(text) {
        return commandControllerAdapter.handleNameCommand(this, text);
    },
    handleSessionCommand() {
        return commandControllerAdapter.handleSessionCommand(this);
    },
    handleChangelogCommand() {
        return commandControllerAdapter.handleChangelogCommand(this);
    },
    capitalizeKey(key) {
        return commandControllerAdapter.capitalizeKey(key);
    },
    getAppKeyDisplay(action) {
        return commandControllerAdapter.getAppKeyDisplay(action);
    },
    getEditorKeyDisplay(action) {
        return commandControllerAdapter.getEditorKeyDisplay(action);
    },
    handleHotkeysCommand() {
        return commandControllerAdapter.handleHotkeysCommand(this);
    },
    async handleClearCommand() {
        return commandControllerAdapter.handleClearCommand(this);
    },
    handleDebugCommand() {
        return commandControllerAdapter.handleDebugCommand(this);
    },
    handleArminSaysHi() {
        return commandControllerAdapter.handleArminSaysHi(this);
    },
    handleDementedDelves() {
        return commandControllerAdapter.handleDementedDelves(this);
    },
    handleDaxnuts() {
        return commandControllerAdapter.handleDaxnuts(this);
    },
    checkDaxnutsEasterEgg(model) {
        return commandControllerAdapter.checkDaxnutsEasterEgg(this, model);
    },
    getBashOutputFlushMs() {
        return hostFacadeAdapter.getBashOutputFlushMs(this);
    },
    queueBashOutput(chunk) {
        return hostFacadeAdapter.queueBashOutput(this, chunk);
    },
    flushBashOutput() {
        return hostFacadeAdapter.flushBashOutput(this);
    },
    async handleBashCommand(command, excludeFromContext = false) {
        return hostFacadeAdapter.handleBashCommand(this, command, excludeFromContext);
    },
    async handleCompactCommand(customInstructions) {
        return commandControllerAdapter.handleCompactCommand(this, customInstructions);
    },
    stop() {
        return processLifecycleAdapter.stop(this);
    },
};

export function installInteractiveModeWrappers(InteractiveModeClass) {
    for (const [name, fn] of Object.entries(WRAPPERS)) {
        Object.defineProperty(InteractiveModeClass.prototype, name, {
            value: fn,
            configurable: true,
            writable: true,
        });
    }
}
