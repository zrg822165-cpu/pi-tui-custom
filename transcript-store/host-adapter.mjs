export class TranscriptHostAdapter {
    host;
    constructor(host) {
        this.host = host;
    }
    get ui() {
        return this.host.ui;
    }
    get rendererHost() {
        return this.host.rendererHost;
    }
    setTranscriptTailLines(lineBudget) {
        this.host.rendererHost.setTranscriptTailLines(lineBudget);
    }
    getChatChildren() {
        return this.host.rendererHost.getChatChildren();
    }
    hasChatChildren() {
        return this.host.rendererHost.hasChatChildren();
    }
    appendChat(component) {
        this.host.rendererHost.appendChat(component);
    }
    removeChat(component) {
        this.host.rendererHost.removeChat(component);
    }
    clearChat() {
        this.host.rendererHost.clearChat();
    }
    clearPending() {
        this.host.rendererHost.clearPending();
    }
    getMarkdownTheme() {
        return this.host.getMarkdownThemeWithSettings();
    }
    getHideThinkingBlock() {
        return this.host.hideThinkingBlock;
    }
    getHiddenThinkingLabel() {
        return this.host.hiddenThinkingLabel;
    }
    getToolOutputExpanded() {
        return this.host.toolOutputExpanded;
    }
    requestRender() {
        this.host.ui.requestRender();
    }
    addEditorHistory(text) {
        this.host.editor.addToHistory?.(text);
    }
    invalidateFooter() {
        this.host.footer.invalidate();
    }
    updateEditorBorderColor() {
        this.host.updateEditorBorderColor();
    }
    flushBeforeTranscriptRebuild() {
        this.host.flushStreamSmoothing(true);
        this.host.flushStreamingMessageUpdate();
        this.host.flushToolExecutionUpdates();
        this.host.flushBashOutput();
    }
    clearStreamSmoothingState() {
        this.host.clearStreamSmoothingState();
    }
    clearCompactionQueueMessages() {
        if (this.host.queueStore) {
            this.host.queueStore.compactionQueuedMessages = [];
        }
    }
    createToolExecutionComponent(toolName, toolCallId, args) {
        return this.host.createToolExecutionComponent(toolName, toolCallId, args);
    }
    attachToolExecutionComponent(component) {
        this.host.attachToolExecutionComponent(component);
    }
    updateToolFlowForToolCall(toolCallId) {
        this.host.updateToolFlowForToolCall(toolCallId);
    }
    resetActiveToolFlow() {
        this.host.resetActiveToolFlow();
    }
    clearToolFlowState() {
        this.host.clearToolFlowState();
    }
    getPendingTool(toolCallId) {
        return this.host.getPendingTool(toolCallId);
    }
    setPendingTool(toolCallId, component) {
        this.host.setPendingTool(toolCallId, component);
    }
    deletePendingTool(toolCallId) {
        this.host.deletePendingTool(toolCallId);
    }
    clearPendingTools() {
        this.host.clearPendingTools();
    }
}
