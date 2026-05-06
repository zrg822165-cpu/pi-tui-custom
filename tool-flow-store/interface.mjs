export const TOOL_FLOW_STORE_PROTOCOL_VERSION = 1;

export const TOOL_FLOW_STORE_SURFACE = Object.freeze({
    componentFactory: [
        "createToolExecutionComponent",
        "attachToolExecutionComponent",
        "shouldAttachToolExecutionComponent",
        "attachToolExecutionComponentIfReady",
        "updateToolFlowForToolCall",
        "resetActiveToolFlow",
    ],
    pendingState: [
        "getPendingTool",
        "setPendingTool",
        "hasPendingTool",
        "deletePendingTool",
        "getPendingToolEntries",
        "clearPendingTools",
        "clearToolFlows",
        "clearAll",
        "hasToolFlow",
    ],
    presentation: [
        "setShowImages",
        "setImageWidthCells",
    ],
});
