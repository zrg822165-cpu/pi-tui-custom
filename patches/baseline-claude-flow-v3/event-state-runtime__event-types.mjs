export const EVENT_GROUPS = Object.freeze({
    agent: new Set(["agent_start", "agent_end"]),
    message: new Set(["message_start", "message_update", "message_end"]),
    tool: new Set(["tool_execution_start", "tool_execution_update", "tool_execution_end"]),
    compaction: new Set(["compaction_start", "compaction_end"]),
    retry: new Set(["auto_retry_start", "auto_retry_end"]),
    queue: new Set(["queue_update"]),
    session: new Set(["session_info_changed", "thinking_level_changed"]),
});

export function classifyEvent(event) {
    const type = event?.type ?? "unknown";
    for (const [group, types] of Object.entries(EVENT_GROUPS)) {
        if (types.has(type)) {
            return group;
        }
    }
    return "unknown";
}

export function getMessageRole(event) {
    return event?.message?.role ?? undefined;
}

export function getToolCallId(event) {
    return event?.toolCallId ?? undefined;
}

export function getEventPhaseHint(event) {
    switch (event?.type) {
        case "agent_start":
            return "agent_running";
        case "agent_end":
            return "idle";
        case "message_start":
            return `${getMessageRole(event) ?? "message"}_message_start`;
        case "message_update":
            return `${getMessageRole(event) ?? "message"}_message_streaming`;
        case "message_end":
            return `${getMessageRole(event) ?? "message"}_message_end`;
        case "tool_execution_start":
            return "tool_executing";
        case "tool_execution_update":
            return "tool_streaming";
        case "tool_execution_end":
            return "tool_finished";
        case "compaction_start":
            return "compacting";
        case "compaction_end":
            return "compaction_finished";
        case "auto_retry_start":
            return "retry_waiting";
        case "auto_retry_end":
            return "retry_finished";
        default:
            return event?.type ?? "unknown";
    }
}
