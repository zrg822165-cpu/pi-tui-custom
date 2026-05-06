export const TRANSCRIPT_STORE_PROTOCOL_VERSION = 1;

export const TRANSCRIPT_STORE_SURFACE = Object.freeze({
    transcript: [
        "renderCurrentSessionState",
        "renderInitialMessages",
        "rebuildChatFromMessages",
        "addMessageToChat",
        "renderSessionContext",
    ],
    status: [
        "showStatus",
        "showError",
        "showWarning",
        "setTranscriptTailRendering",
        "getVisibleTranscriptLineBudget",
    ],
    streaming: [
        "hasStreamingAssistant",
        "getStreamingMessage",
        "getStreamingComponent",
        "adoptStreamingComponent",
        "adoptStreamingMessage",
        "startStreamingAssistant",
        "updateStreamingAssistant",
        "setStreamingAssistantErrorMessage",
        "finishStreamingAssistant",
        "removeStreamingAssistant",
        "syncStreamingAssistantDisplayOptions",
    ],
});

export const TRANSCRIPT_HOST_ADAPTER_SURFACE = Object.freeze({
    ui: [
        "ui",
        "requestRender",
        "setTranscriptTailLines",
        "getChatChildren",
        "hasChatChildren",
        "appendChat",
        "removeChat",
        "clearChat",
        "clearPending",
    ],
    presentation: [
        "getMarkdownTheme",
        "getHideThinkingBlock",
        "getHiddenThinkingLabel",
        "getToolOutputExpanded",
        "addEditorHistory",
        "invalidateFooter",
        "updateEditorBorderColor",
    ],
    rebuildHooks: [
        "flushBeforeTranscriptRebuild",
        "clearStreamSmoothingState",
        "clearCompactionQueueMessages",
    ],
    toolFlow: [
        "createToolExecutionComponent",
        "attachToolExecutionComponent",
        "updateToolFlowForToolCall",
        "resetActiveToolFlow",
        "clearToolFlowState",
        "getPendingTool",
        "setPendingTool",
        "deletePendingTool",
        "clearPendingTools",
    ],
});
