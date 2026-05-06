import { TuiEventType } from "./events.mjs";

function getSessionSnapshot(mode) {
    const session = mode?.session;
    const manager = mode?.sessionManager;
    return {
        id: manager?.getSessionId?.(),
        name: manager?.getSessionName?.(),
        cwd: manager?.getCwd?.(),
        file: manager?.getSessionFile?.(),
        isStreaming: session?.isStreaming ?? false,
        isBashRunning: session?.isBashRunning ?? false,
    };
}

function summarizeMessage(message) {
    if (!message) {
        return undefined;
    }
    return {
        role: message.role,
        id: message.id,
        stopReason: message.stopReason,
        contentTypes: Array.isArray(message.content)
            ? message.content.map((content) => content.type).join(",")
            : undefined,
        contentLength: Array.isArray(message.content)
            ? message.content.reduce((total, content) => total + (typeof content.text === "string" ? content.text.length : 0), 0)
            : 0,
    };
}

function summarizeToolResult(result, isError) {
    return {
        isError: isError ?? result?.isError ?? false,
        contentTypes: Array.isArray(result?.content)
            ? result.content.map((content) => content.type).join(",")
            : undefined,
        contentLength: Array.isArray(result?.content)
            ? result.content.reduce((total, content) => total + (typeof content.text === "string" ? content.text.length : 0), 0)
            : 0,
    };
}

export function toTuiEvent(agentEvent, mode) {
    const session = getSessionSnapshot(mode);
    switch (agentEvent.type) {
        case "agent_start":
            return { type: TuiEventType.STATUS_UPDATE, status: "agent_start", session };
        case "agent_end":
            return { type: TuiEventType.STATUS_UPDATE, status: "agent_end", session };
        case "message_start":
            return { type: TuiEventType.MESSAGE_START, session, message: summarizeMessage(agentEvent.message) };
        case "message_update":
            return {
                type: TuiEventType.MESSAGE_DELTA,
                session,
                message: summarizeMessage(agentEvent.message),
                deltaType: agentEvent.assistantMessageEvent?.type,
            };
        case "message_end":
            return { type: TuiEventType.MESSAGE_END, session, message: summarizeMessage(agentEvent.message) };
        case "tool_execution_start":
            return {
                type: TuiEventType.TOOL_START,
                session,
                toolCallId: agentEvent.toolCallId,
                toolName: agentEvent.toolName,
            };
        case "tool_execution_update":
            return {
                type: TuiEventType.TOOL_DELTA,
                session,
                toolCallId: agentEvent.toolCallId,
                result: summarizeToolResult(agentEvent.partialResult, false),
            };
        case "tool_execution_end":
            return {
                type: TuiEventType.TOOL_END,
                session,
                toolCallId: agentEvent.toolCallId,
                result: summarizeToolResult(agentEvent.result, agentEvent.isError),
            };
        case "session_info_changed":
            return { type: TuiEventType.SESSION_SWITCHED, session };
        default:
            return { type: TuiEventType.STATUS_UPDATE, status: agentEvent.type, session };
    }
}

