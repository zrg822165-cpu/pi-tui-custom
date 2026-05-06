export const INTERACTIVE_HOST_CONTRACT_VERSION = 1;

export const INTERACTIVE_HOST_REQUIRED_PATHS = Object.freeze([
    "addMessageToChat",
    "addCompactionError",
    "addCompactionSummary",
    "attachPendingToolIfReady",
    "checkShutdownRequested",
    "clearPendingTools",
    "clearToolFlowState",
    "clearStatusLine",
    "createPendingToolIfMissing",
    "deletePendingTool",
    "disposeExistingRetryCountdown",
    "disposeRetryCountdown",
    "ensureResponseLoader",
    "ensureToolThinkingStatus",
    "finalizePendingToolArgs",
    "finishStreamingAssistant",
    "flushCompactionQueue",
    "flushStreamingMessageUpdate",
    "flushToolExecutionUpdates",
    "getRetryAttempt",
    "hasCompactionEscapeHandler",
    "hasCompactionLoader",
    "hasPendingTool",
    "hasRetryCountdown",
    "hasRetryEscapeHandler",
    "hasRetryLoader",
    "hasStreamingAssistant",
    "hasWorkingLoader",
    "invalidateFooter",
    "markAllPendingToolsError",
    "markPendingToolStarted",
    "markToolThinkingActivity",
    "queueAssistantStreamUpdate",
    "queuePendingToolUpdate",
    "requestRender",
    "resetActiveToolFlow",
    "setAssistantActivity",
    "setCompactionAbortHandler",
    "setRetryAbortHandler",
    "setStreamingAbortError",
    "setStreamingAssistantMessage",
    "setTerminalProgress",
    "setToolThinkingPhase",
    "setTranscriptTailRendering",
    "shouldShowThinkingStatus",
    "shouldShowTerminalProgress",
    "shouldStartWorkingLoader",
    "saveCompactionEscapeHandler",
    "saveRetryEscapeHandler",
    "showError",
    "showCompactionLoader",
    "showRetryLoader",
    "showStatus",
    "stopCompactionLoader",
    "stopRetryLoader",
    "stopToolThinkingStatus",
    "stopToolThinkingIfVisibleText",
    "startStreamingAssistant",
    "startWorkingLoaderIfVisible",
    "stopWorkingLoader",
    "removeStreamingAssistant",
    "restoreCompactionEscapeHandler",
    "restoreRetryEscapeHandler",
    "updateEditorBorderColor",
    "updatePendingMessagesDisplay",
    "updatePendingToolResult",
    "updateStreamingAssistantContent",
    "updateTerminalTitle",
    "updateToolFlowForToolCall",
]);

export const INTERACTIVE_HOST_OPTIONAL_PATHS = Object.freeze([
    "autoCompactionEscapeHandler",
    "autoCompactionLoader",
    "loadingAnimation",
    "retryCountdown",
    "retryEscapeHandler",
    "retryLoader",
    "streamingComponent",
    "streamingMessage",
    "workingVisible",
]);

export function validateInteractiveHost(host, options = {}) {
    const requiredPaths = options.requiredPaths ?? INTERACTIVE_HOST_REQUIRED_PATHS;
    const missing = [];
    for (const path of requiredPaths) {
        if (!hasPath(host, path)) {
            missing.push(path);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: requiredPaths.length,
    };
}

export function assertInteractiveHost(host, options = {}) {
    const result = validateInteractiveHost(host, options);
    if (!result.ok) {
        throw new Error(`Interactive host contract missing: ${result.missing.join(", ")}`);
    }
    return result;
}

function hasPath(value, path) {
    let current = value;
    for (const part of path.split(".")) {
        if (current == null || !(part in current)) {
            return false;
        }
        current = current[part];
    }
    return true;
}
