/**
 * Interactive mode for the coding agent.
 * Handles TUI rendering and user interaction, delegating business logic to AgentSession.
 */
import * as interactiveBootstrapAdapter from "../../../../../../interactive-mode-support/interactive-bootstrap-adapter.mjs";
import * as hostFacadeAdapter from "../../../../../../interactive-mode-support/host-facade-adapter.mjs";
import * as customEditorAdapter from "../../../../../../interactive-mode-support/custom-editor-adapter.mjs";
import * as extensionUiAdapter from "../../../../../../interactive-mode-support/extension-ui-adapter.mjs";
import * as extensionWidgetsAdapter from "../../../../../../interactive-mode-support/extension-widgets-adapter.mjs";
import * as extensionRuntimeAdapter from "../../../../../../interactive-mode-support/extension-runtime-adapter.mjs";
import * as selectorControllerAdapter from "../../../../../../interactive-mode-support/selector-controller-adapter.mjs";
import * as startupControllerAdapter from "../../../../../../interactive-mode-support/startup-controller-adapter.mjs";
import { installInteractiveModeWrappers } from "../../../../../../interactive-mode-support/interactive-wrapper-registry.mjs";
import * as pathFormatters from "../../../../../../interactive-mode-support/path-formatters.mjs";
import * as resourceSourceFormatters from "../../../../../../interactive-mode-support/resource-source-formatters.mjs";
import * as streamRuntimeAdapter from "../../../../../../interactive-mode-support/stream-runtime-adapter.mjs";
import * as autocompleteRuntimeAdapter from "../../../../../../interactive-mode-support/autocomplete-runtime-adapter.mjs";
import * as lifecycleRuntimeAdapter from "../../../../../../interactive-mode-support/lifecycle-runtime-adapter.mjs";
export const isApiKeyLoginProvider = selectorControllerAdapter.isApiKeyLoginProvider;
export class InteractiveMode {
    options;
    runtimeHost;
    ui;
    defaultEditor;
    editor;
    editorComponentFactory;
    autocompleteProvider;
    autocompleteProviderWrappers = [];
    fdPath;
    footer;
    footerDataProvider;
    // Stored so the same manager can be injected into custom editors, selectors, and extension UI.
    keybindings;
    version;
    isInitialized = false;
    onInputCallback;
    loadingAnimation = undefined;
    thinkingStatus = undefined;
    workingMessage = undefined;
    workingVisible = true;
    workingIndicatorOptions = undefined;
    defaultWorkingMessage = "Working...";
    defaultHiddenThinkingLabel = "Thinking...";
    hiddenThinkingLabel = this.defaultHiddenThinkingLabel;
    lastSigintTime = 0;
    lastEscapeTime = 0;
    changelogMarkdown = undefined;
    startupNoticesShown = false;
    anthropicSubscriptionWarningShown = false;
    // Status line tracking (for mutating immediately-sequential status updates)
    lastStatusSpacer = undefined;
    lastStatusText = undefined;
    // Streaming update timers remain here; streaming transcript state lives in TranscriptStore.
    streamingUpdateTimer = undefined;
    streamingUpdateEvent = undefined;
    streamingUpdateMessage = undefined;
    streamingUpdateQueuedAt = 0;
    lastStreamingEventAt = 0;
    lastStreamingFlushAt = 0;
    streamSmoothingTimer = undefined;
    streamSmoothingTargetMessage = undefined;
    streamSmoothingTargetEvent = undefined;
    streamSmoothingQueuedAt = 0;
    streamSmoothingDisplayedLength = 0;
    lastStreamSmoothingFlushAt = 0;
    streamSmoothingLastEventGapMs = 0;
    toolUpdateTimer = undefined;
    pendingToolUpdates = new Map();
    // Tool execution tracking lives in ToolFlowStore.
    // Tool output expansion state
    toolOutputExpanded = false;
    // Thinking block visibility state
    hideThinkingBlock = false;
    // Skill commands: command name -> skill file path
    skillCommands = new Map();
    // Agent subscription unsubscribe function
    unsubscribe;
    signalCleanupHandlers = [];
    // Track if editor is in bash mode (text starts with !)
    isBashMode = false;
    // Auto-compaction state
    autoCompactionLoader = undefined;
    autoCompactionEscapeHandler;
    // Auto-retry state
    retryLoader = undefined;
    retryCountdown = undefined;
    retryEscapeHandler;
    // Shutdown state
    shutdownRequested = false;
    // Extension UI state
    extensionSelector = undefined;
    extensionInput = undefined;
    extensionEditor = undefined;
    extensionTerminalInputUnsubscribers = new Set();
    // Extension widgets (components rendered above/below the editor)
    extensionWidgetsAbove = new Map();
    extensionWidgetsBelow = new Map();
    // Custom footer from extension (undefined = use built-in footer)
    customFooter = undefined;
    customTuiRenderer = undefined;
    rendererHost;
    // Built-in header (logo + keybinding hints + changelog)
    builtInHeader = undefined;
    // Custom header from extension (undefined = use built-in header)
    customHeader = undefined;
    // Convenience accessors
    get settingsManager() {
        return this.sessionStore.settingsManager;
    }
    get streamingComponent() {
        return hostFacadeAdapter.getStreamingComponent(this);
    }
    set streamingComponent(component) {
        hostFacadeAdapter.setStreamingComponent(this, component);
    }
    get streamingMessage() {
        return hostFacadeAdapter.getStreamingMessage(this);
    }
    set streamingMessage(message) {
        hostFacadeAdapter.setStreamingMessage(this, message);
    }
    getVisibleTranscriptLineBudget() {
        return hostFacadeAdapter.getVisibleTranscriptLineBudget(this);
    }
    setTranscriptTailRendering(active) {
        return hostFacadeAdapter.setTranscriptTailRendering(this, active);
    }
    constructor(runtimeHost, options = {}) {
        interactiveBootstrapAdapter.initializeInteractiveModeHost(this, runtimeHost, options);
    }
    getAutocompleteSourceTag(sourceInfo) {
        return pathFormatters.getAutocompleteSourceTag(sourceInfo);
    }
    prefixAutocompleteDescription(description, sourceInfo) {
        const sourceTag = this.getAutocompleteSourceTag(sourceInfo);
        if (!sourceTag) {
            return description;
        }
        return description ? `[${sourceTag}] ${description}` : `[${sourceTag}]`;
    }
    getBuiltInCommandConflictDiagnostics(extensionRunner) {
        return autocompleteRuntimeAdapter.getBuiltInCommandConflictDiagnostics(extensionRunner);
    }
    createBaseAutocompleteProvider() {
        return autocompleteRuntimeAdapter.createBaseAutocompleteProvider(this);
    }
    setupAutocompleteProvider() {
        return autocompleteRuntimeAdapter.setupAutocompleteProvider(this);
    }
    showStartupNoticesIfNeeded() {
        startupControllerAdapter.showStartupNoticesIfNeeded(this);
    }
    async init() {
        return lifecycleRuntimeAdapter.init(this);
    }
    /**
     * Update terminal title with session name and cwd.
     */
    updateTerminalTitle() {
        return lifecycleRuntimeAdapter.updateTerminalTitle(this);
    }
    /**
     * Run the interactive mode. This is the main entry point.
     * Initializes the UI, shows warnings, processes initial messages, and starts the interactive loop.
     */
    async run() {
        return lifecycleRuntimeAdapter.run(this);
    }
    async checkForPackageUpdates() {
        return lifecycleRuntimeAdapter.checkForPackageUpdates(this);
    }
    async checkTmuxKeyboardSetup() {
        return lifecycleRuntimeAdapter.checkTmuxKeyboardSetup();
    }
    /**
     * Get changelog entries to display on startup.
     * Only shows new entries since last seen version, skips for resumed sessions.
     */
    getChangelogForDisplay() {
        return lifecycleRuntimeAdapter.getChangelogForDisplay(this);
    }
    reportInstallTelemetry(version) {
        return lifecycleRuntimeAdapter.reportInstallTelemetry(this, version);
    }
    getMarkdownThemeWithSettings() {
        return pathFormatters.getMarkdownThemeWithSettings(this);
    }
    // =========================================================================
    // Extension System
    // =========================================================================
    formatDisplayPath(p) {
        return pathFormatters.formatDisplayPath(p);
    }
    formatExtensionDisplayPath(path) {
        return pathFormatters.formatExtensionDisplayPath(path);
    }
    formatContextPath(p) {
        return pathFormatters.formatContextPathForHost(this, p);
    }
    getStartupExpansionState() {
        return hostFacadeAdapter.getStartupExpansionState(this);
    }
    createToolExecutionComponent(toolName, toolCallId, args) {
        return hostFacadeAdapter.createToolExecutionComponent(this, toolName, toolCallId, args);
    }
    attachToolExecutionComponent(component) {
        return hostFacadeAdapter.attachToolExecutionComponent(this, component);
    }
    shouldAttachToolExecutionComponent(component, force = false) {
        return hostFacadeAdapter.shouldAttachToolExecutionComponent(this, component, force);
    }
    attachToolExecutionComponentIfReady(component, force = false) {
        return hostFacadeAdapter.attachToolExecutionComponentIfReady(this, component, force);
    }
    updateToolFlowForToolCall(toolCallId) {
        return hostFacadeAdapter.updateToolFlowForToolCall(this, toolCallId);
    }
    resetActiveToolFlow() {
        return hostFacadeAdapter.resetActiveToolFlow(this);
    }
    getPendingTool(toolCallId) {
        return hostFacadeAdapter.getPendingTool(this, toolCallId);
    }
    setPendingTool(toolCallId, component) {
        return hostFacadeAdapter.setPendingTool(this, toolCallId, component);
    }
    hasPendingTool(toolCallId) {
        return hostFacadeAdapter.hasPendingToolInFlow(this, toolCallId);
    }
    deletePendingTool(toolCallId) {
        return hostFacadeAdapter.deletePendingTool(this, toolCallId);
    }
    getPendingToolEntries() {
        return hostFacadeAdapter.getPendingToolEntries(this);
    }
    clearPendingTools() {
        return hostFacadeAdapter.clearPendingTools(this);
    }
    clearToolFlowState() {
        return hostFacadeAdapter.clearToolFlowState(this);
    }
    hasToolFlow(toolCallId) {
        return hostFacadeAdapter.hasToolFlow(this, toolCallId);
    }
    /**
     * Get a short path relative to the package root for display.
     */
    getShortPath(fullPath, sourceInfo) {
        return pathFormatters.getShortPathForHost(this, fullPath, sourceInfo);
    }
    getCompactPathLabel(resourcePath, sourceInfo) {
        return pathFormatters.getCompactPathLabelForHost(this, resourcePath, sourceInfo);
    }
    getCompactPackageSourceLabel(sourceInfo) {
        return pathFormatters.getCompactPackageSourceLabel(sourceInfo);
    }
    getCompactExtensionLabel(resourcePath, sourceInfo) {
        return pathFormatters.getCompactExtensionLabelForHost(this, resourcePath, sourceInfo);
    }
    getCompactDisplayPathSegments(resourcePath) {
        return pathFormatters.getCompactDisplayPathSegments(resourcePath);
    }
    getCompactNonPackageExtensionLabel(resourcePath, index, allPaths) {
        return pathFormatters.getCompactNonPackageExtensionLabel(resourcePath, index, allPaths);
    }
    getCompactExtensionLabels(extensions) {
        return pathFormatters.getCompactExtensionLabelsForHost(this, extensions);
    }
    getDisplaySourceInfo(sourceInfo) {
        return resourceSourceFormatters.getDisplaySourceInfo(sourceInfo);
    }
    getScopeGroup(sourceInfo) {
        return resourceSourceFormatters.getScopeGroup(sourceInfo);
    }
    isPackageSource(sourceInfo) {
        return resourceSourceFormatters.isPackageSource(sourceInfo);
    }
    buildScopeGroups(items) {
        return resourceSourceFormatters.buildScopeGroups(items, {
            getScopeGroup: (sourceInfo) => this.getScopeGroup(sourceInfo),
            isPackageSource: (sourceInfo) => this.isPackageSource(sourceInfo),
        });
    }
    formatScopeGroups(groups, options) {
        return resourceSourceFormatters.formatScopeGroupsForHost(groups, options);
    }
    findSourceInfoForPath(p, sourceInfos) {
        return resourceSourceFormatters.findSourceInfoForPath(p, sourceInfos);
    }
    formatPathWithSource(p, sourceInfo) {
        return resourceSourceFormatters.formatPathWithSourceForHost(this, p, sourceInfo);
    }
    formatDiagnostics(diagnostics, sourceInfos) {
        return resourceSourceFormatters.formatDiagnosticsForHost(this, diagnostics, sourceInfos);
    }
    showLoadedResources(options) {
        startupControllerAdapter.showLoadedResources(this, options);
    }
    /**
     * Initialize the extension system with TUI-based UI context.
     */
    async bindCurrentSessionExtensions() {
        return extensionRuntimeAdapter.bindCurrentSessionExtensions(this);
    }
    applyRuntimeSettings() {
        startupControllerAdapter.applyRuntimeSettings(this);
    }
    async rebindCurrentSession() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.applyRuntimeSettings();
        await this.bindCurrentSessionExtensions();
        this.subscribeToAgent();
        await this.updateAvailableProviderCount();
        this.updateEditorBorderColor();
        this.updateTerminalTitle();
    }
    async handleFatalRuntimeError(prefix, error) {
        return lifecycleRuntimeAdapter.handleFatalRuntimeError(this, prefix, error);
    }
    renderCurrentSessionState() {
        return hostFacadeAdapter.renderCurrentSessionState(this);
    }
    getStreamingTextStats(message) {
        return streamRuntimeAdapter.getStreamingTextStats(message);
    }
    recordStreamTiming(entry) {
        return streamRuntimeAdapter.recordStreamTiming(entry);
    }
    getStreamSmoothingMode() {
        return streamRuntimeAdapter.getStreamSmoothingMode();
    }
    isStreamSmoothingEnabled() {
        return streamRuntimeAdapter.isStreamSmoothingEnabled();
    }
    getStreamSmoothingRejectReason(event, eventGapMs = 0) {
        return streamRuntimeAdapter.getStreamSmoothingRejectReason(this, event, eventGapMs);
    }
    getStreamSmoothingDelay() {
        return streamRuntimeAdapter.getStreamSmoothingDelay();
    }
    getStreamSmoothingStep(backlog, queuedDelayMs) {
        return streamRuntimeAdapter.getStreamSmoothingStep(this, backlog, queuedDelayMs);
    }
    canSmoothStreamingEvent(event) {
        return streamRuntimeAdapter.canSmoothStreamingEvent(this, event);
    }
    getSmoothTextContentInfo(message) {
        return streamRuntimeAdapter.getSmoothTextContentInfo(message);
    }
    getSingleTextContent(message) {
        return streamRuntimeAdapter.getSingleTextContent(message);
    }
    cloneStreamingMessageWithText(message, text) {
        return streamRuntimeAdapter.cloneStreamingMessageWithText(message, text);
    }
    clearStreamSmoothingState() {
        return streamRuntimeAdapter.clearStreamSmoothingState(this);
    }
    queueSmoothedStreamingUpdate(event, now, eventGapMs = 0) {
        return streamRuntimeAdapter.queueSmoothedStreamingUpdate(this, event, now, eventGapMs);
    }
    flushStreamSmoothing(immediate = false) {
        return streamRuntimeAdapter.flushStreamSmoothing(this, immediate);
    }
    queueStreamingMessageUpdate(event) {
        return streamRuntimeAdapter.queueStreamingMessageUpdate(this, event);
    }
    flushStreamingMessageUpdate() {
        return streamRuntimeAdapter.flushStreamingMessageUpdate(this);
    }
    queueToolExecutionUpdate(event) {
        return streamRuntimeAdapter.queueToolExecutionUpdate(this, event);
    }
    flushToolExecutionUpdates() {
        return streamRuntimeAdapter.flushToolExecutionUpdates(this);
    }
    /**
     * Get a registered tool definition by name (for custom rendering).
     */
    getRegisteredToolDefinition(toolName) {
        return this.sessionStore.getToolDefinition(toolName);
    }
    /**
     * Set up keyboard shortcuts registered by extensions.
     */
    setupExtensionShortcuts(extensionRunner) {
        return extensionRuntimeAdapter.setupExtensionShortcuts(this, extensionRunner);
    }
    /**
     * Set extension status text in the footer.
     */
    setExtensionStatus(key, text) {
        this.footerDataProvider.setExtensionStatus(key, text);
        this.ui.requestRender();
    }
    getWorkingLoaderMessage() {
        return hostFacadeAdapter.getWorkingLoaderMessage(this);
    }
    createWorkingLoader() {
        return hostFacadeAdapter.createWorkingLoader(this);
    }
    createResponseLoader() {
        return hostFacadeAdapter.createResponseLoader(this);
    }
    shouldShowThinkingStatus() {
        return hostFacadeAdapter.shouldShowThinkingStatus(this);
    }
    ensureResponseLoader() {
        return hostFacadeAdapter.ensureResponseLoader(this);
    }
    ensureToolThinkingStatus() {
        return hostFacadeAdapter.ensureToolThinkingStatus(this);
    }
    stopToolThinkingStatus() {
        return hostFacadeAdapter.stopToolThinkingStatus(this);
    }
    messageHasVisibleText(message) {
        return hostFacadeAdapter.messageHasVisibleText(this, message);
    }
    messageHasToolCall(message) {
        return hostFacadeAdapter.messageHasToolCall(this, message);
    }
    stopWorkingLoader() {
        return hostFacadeAdapter.stopUiStateWorkingLoader(this);
    }
    setWorkingVisible(visible) {
        return hostFacadeAdapter.setWorkingVisible(this, visible);
    }
    setWorkingIndicator(options) {
        return hostFacadeAdapter.setWorkingIndicator(this, options);
    }
    setHiddenThinkingLabel(label) {
        return hostFacadeAdapter.setHiddenThinkingLabel(this, label);
    }
    /**
     * Set an extension widget (string array or custom component).
     */
    setExtensionWidget(key, content, options) {
        return extensionWidgetsAdapter.setExtensionWidgetForHost(this, key, content, {
            ...options,
            maxLines: InteractiveMode.MAX_WIDGET_LINES,
        });
    }
    clearExtensionWidgets() {
        return extensionWidgetsAdapter.clearExtensionWidgetsForHost(this);
    }
    resetExtensionUI() {
        return extensionRuntimeAdapter.resetExtensionUI(this);
    }
    // Maximum total widget lines to prevent viewport overflow
    static MAX_WIDGET_LINES = 10;
    /**
     * Render all extension widgets to the widget container.
     */
    renderWidgets() {
        return extensionWidgetsAdapter.renderExtensionWidgetsForHost(this);
    }
    /**
     * Set a custom footer component, or restore the built-in footer.
     */
    setExtensionFooter(factory) {
        return extensionRuntimeAdapter.setExtensionFooter(this, factory);
    }
    /**
     * Set a custom header component, or restore the built-in header.
     */
    setExtensionHeader(factory) {
        return extensionRuntimeAdapter.setExtensionHeader(this, factory);
    }
    addExtensionTerminalInputListener(handler) {
        return extensionUiAdapter.addExtensionTerminalInputListener(this, handler);
    }
    clearExtensionTerminalInputListeners() {
        extensionUiAdapter.clearExtensionTerminalInputListeners(this);
    }
    /**
     * Create the ExtensionUIContext for extensions.
     */
    createExtensionUIContext() {
        return extensionRuntimeAdapter.createExtensionUIContext(this);
    }
    /**
     * Show a selector for extensions.
     */
    showExtensionSelector(title, options, opts) {
        return extensionUiAdapter.showExtensionSelector(this, title, options, opts);
    }
    /**
     * Hide the extension selector.
     */
    hideExtensionSelector() {
        extensionUiAdapter.hideExtensionSelector(this);
    }
    /**
     * Show a confirmation dialog for extensions.
     */
    async showExtensionConfirm(title, message, opts) {
        const result = await this.showExtensionSelector(`${title}\n${message}`, ["Yes", "No"], opts);
        return result === "Yes";
    }
    async promptForMissingSessionCwd(error) {
        return extensionUiAdapter.promptForMissingSessionCwd(this, error);
    }
    /**
     * Show a text input for extensions.
     */
    showExtensionInput(title, placeholder, opts) {
        return extensionUiAdapter.showExtensionInput(this, title, placeholder, opts);
    }
    /**
     * Hide the extension input.
     */
    hideExtensionInput() {
        extensionUiAdapter.hideExtensionInput(this);
    }
    /**
     * Show a multi-line editor for extensions (with Ctrl+G support).
     */
    showExtensionEditor(title, prefill) {
        return extensionUiAdapter.showExtensionEditor(this, title, prefill);
    }
    /**
     * Hide the extension editor.
     */
    hideExtensionEditor() {
        extensionUiAdapter.hideExtensionEditor(this);
    }
    /**
     * Set a custom editor component from an extension.
     * Pass undefined to restore the default editor.
     */
    setCustomEditorComponent(factory) {
        customEditorAdapter.setCustomEditorComponent(this, factory);
    }
    /**
     * Show a notification for extensions.
     */
    showExtensionNotify(message, type) {
        extensionUiAdapter.showExtensionNotify(this, message, type);
    }
    /** Show a custom component with keyboard focus. Overlay mode renders on top of existing content. */
    async showExtensionCustom(factory, options) {
        return extensionUiAdapter.showExtensionCustom(this, factory, options);
    }
    /**
     * Show an extension error in the UI.
     */
    showExtensionError(extensionPath, error, stack) {
        return extensionUiAdapter.showExtensionError(this, extensionPath, error, stack);
    }
    isShuttingDown = false;
}
installInteractiveModeWrappers(InteractiveMode);
//# sourceMappingURL=interactive-mode.js.map
