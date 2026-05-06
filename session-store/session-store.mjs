export class SessionStore {
    runtimeHost;
    constructor(runtimeHost) {
        this.runtimeHost = runtimeHost;
    }
    get session() {
        return this.runtimeHost.session;
    }
    get agent() {
        return this.session.agent;
    }
    get signal() {
        return this.session.agent.signal;
    }
    get sessionManager() {
        return this.session.sessionManager;
    }
    get settingsManager() {
        return this.session.settingsManager;
    }
    getFooterSession() {
        return this.session;
    }
    getSessionManagerAdapter() {
        return this.sessionManager;
    }
    get model() {
        return this.session.model;
    }
    get modelRegistry() {
        return this.session.modelRegistry;
    }
    get resourceLoader() {
        return this.session.resourceLoader;
    }
    get extensionRunner() {
        return this.session.extensionRunner;
    }
    get retryAttempt() {
        return this.session.retryAttempt;
    }
    get systemPrompt() {
        return this.session.systemPrompt;
    }
    get autoCompactionEnabled() {
        return this.session.autoCompactionEnabled;
    }
    get steeringMode() {
        return this.session.steeringMode;
    }
    get followUpMode() {
        return this.session.followUpMode;
    }
    get thinkingLevel() {
        return this.session.thinkingLevel;
    }
    get scopedModels() {
        return this.session.scopedModels;
    }
    get promptTemplates() {
        return this.session.promptTemplates;
    }
    get isStreaming() {
        return this.session.isStreaming;
    }
    get isBashRunning() {
        return this.session.isBashRunning;
    }
    get isCompacting() {
        return this.session.isCompacting;
    }
    get pendingMessageCount() {
        return this.session.pendingMessageCount;
    }
    getCurrentModel() {
        return this.session.model;
    }
    getSignal() {
        return this.session.agent.signal;
    }
    getRetryAttempt() {
        return this.session.retryAttempt;
    }
    getSystemPrompt() {
        return this.session.systemPrompt;
    }
    getAutoCompactionEnabled() {
        return this.session.autoCompactionEnabled;
    }
    getSteeringMode() {
        return this.session.steeringMode;
    }
    getFollowUpMode() {
        return this.session.followUpMode;
    }
    getThinkingLevel() {
        return this.session.thinkingLevel;
    }
    isIdle() {
        return !this.session.isStreaming;
    }
    isStreamingActive() {
        return this.session.isStreaming;
    }
    isBashActive() {
        return this.session.isBashRunning;
    }
    isCompactionActive() {
        return this.session.isCompacting;
    }
    hasPendingMessages() {
        return this.session.pendingMessageCount > 0;
    }
    hasMessages() {
        return (this.session.state?.messages?.length ?? 0) > 0;
    }
    getModelRegistry() {
        return this.session.modelRegistry;
    }
    refreshModelRegistry() {
        return this.session.modelRegistry.refresh();
    }
    getModelsJsonError() {
        return this.session.modelRegistry.getError();
    }
    getAvailableModels() {
        return this.session.modelRegistry.getAvailable();
    }
    getAllModels() {
        return this.session.modelRegistry.getAll();
    }
    getProviderDisplayName(providerId) {
        return this.session.modelRegistry.getProviderDisplayName(providerId);
    }
    getProviderAuthStatus(providerId) {
        return this.session.modelRegistry.getProviderAuthStatus(providerId);
    }
    getProviderAuthStorage() {
        return this.session.modelRegistry.authStorage;
    }
    getApiKeyForProvider(providerId) {
        return this.session.modelRegistry.getApiKeyForProvider(providerId);
    }
    getScopedModels() {
        return this.session.scopedModels;
    }
    hasScopedModels() {
        return this.session.scopedModels.length > 0;
    }
    getScopedModelValues() {
        return this.session.scopedModels.map((scoped) => scoped.model);
    }
    getPromptTemplates() {
        return this.session.promptTemplates;
    }
    getSkillsResult() {
        return this.session.resourceLoader.getSkills();
    }
    getPromptsResult() {
        return this.session.resourceLoader.getPrompts();
    }
    getThemesResult() {
        return this.session.resourceLoader.getThemes();
    }
    getRegisteredThemes() {
        return this.session.resourceLoader.getThemes().themes;
    }
    getExtensionsResult() {
        return this.session.resourceLoader.getExtensions();
    }
    getAgentsFilesResult() {
        return this.session.resourceLoader.getAgentsFiles();
    }
    getExtensionRunner() {
        return this.session.extensionRunner;
    }
    getMessageRenderer(customType) {
        return this.session.extensionRunner.getMessageRenderer(customType);
    }
    getExtensionCommands() {
        return this.session.extensionRunner.getCommands();
    }
    getExtensionShortcuts(keybindingsConfig) {
        return this.session.extensionRunner.getShortcuts(keybindingsConfig);
    }
    getExtensionCommandDiagnostics() {
        return this.session.extensionRunner.getCommandDiagnostics();
    }
    getExtensionShortcutDiagnostics() {
        return this.session.extensionRunner.getShortcutDiagnostics();
    }
    getCwd() {
        return this.sessionManager.getCwd();
    }
    getLeafId() {
        return this.sessionManager.getLeafId();
    }
    getTree() {
        return this.sessionManager.getTree();
    }
    getSessionFile() {
        return this.sessionManager.getSessionFile();
    }
    getSessionDir() {
        return this.sessionManager.getSessionDir();
    }
    getSessionName() {
        return this.sessionManager.getSessionName();
    }
    setSessionName(name) {
        return this.session.setSessionName(name);
    }
    buildSessionContext() {
        return this.sessionManager.buildSessionContext();
    }
    getEntries() {
        return this.sessionManager.getEntries();
    }
    getSessionStats() {
        return this.session.getSessionStats();
    }
    getUserMessagesForForking() {
        return this.session.getUserMessagesForForking();
    }
    getSteeringMessages() {
        return this.session.getSteeringMessages();
    }
    getFollowUpMessages() {
        return this.session.getFollowUpMessages();
    }
    getLastAssistantText() {
        return this.session.getLastAssistantText();
    }
    getContextUsage() {
        return this.session.getContextUsage();
    }
    getToolDefinition(toolName) {
        return this.session.getToolDefinition(toolName);
    }
    getAvailableThinkingLevels() {
        return this.session.getAvailableThinkingLevels();
    }
    prompt(text, options) {
        return this.session.prompt(text, options);
    }
    steer(text) {
        return this.session.steer(text);
    }
    followUp(text) {
        return this.session.followUp(text);
    }
    subscribe(callback) {
        return this.session.subscribe(callback);
    }
    abort() {
        return this.session.abort();
    }
    abortBash() {
        return this.session.abortBash();
    }
    abortCompaction() {
        return this.session.abortCompaction();
    }
    abortRetry() {
        return this.session.abortRetry();
    }
    abortBranchSummary() {
        return this.session.abortBranchSummary();
    }
    abortCompactionIfActive() {
        if (this.session.isCompacting) {
            return this.session.abortCompaction();
        }
        return undefined;
    }
    compact(customInstructions) {
        return this.session.compact(customInstructions);
    }
    reload() {
        return this.session.reload();
    }
    bindExtensions(options) {
        return this.session.bindExtensions(options);
    }
    navigateTree(targetId, options) {
        return this.session.navigateTree(targetId, options);
    }
    waitForIdle() {
        return this.session.agent.waitForIdle();
    }
    cycleThinkingLevel() {
        return this.session.cycleThinkingLevel();
    }
    cycleModel(direction) {
        return this.session.cycleModel(direction);
    }
    setModel(model) {
        return this.session.setModel(model);
    }
    setScopedModels(scopedModels) {
        return this.session.setScopedModels(scopedModels);
    }
    setAutoCompactionEnabled(enabled) {
        return this.session.setAutoCompactionEnabled(enabled);
    }
    setSteeringMode(mode) {
        return this.session.setSteeringMode(mode);
    }
    setFollowUpMode(mode) {
        return this.session.setFollowUpMode(mode);
    }
    setThinkingLevel(level) {
        return this.session.setThinkingLevel(level);
    }
    setTransport(transport) {
        this.session.agent.transport = transport;
    }
    exportToJsonl(outputPath) {
        return this.session.exportToJsonl(outputPath);
    }
    exportToHtml(outputPath) {
        return this.session.exportToHtml(outputPath);
    }
    clearQueue() {
        return this.session.clearQueue();
    }
    appendLabelChange(entryId, label) {
        return this.sessionManager.appendLabelChange(entryId, label);
    }
}
