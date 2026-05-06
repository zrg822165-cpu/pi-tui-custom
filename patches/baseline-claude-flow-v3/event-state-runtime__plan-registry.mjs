export const PLAN_REASON_BY_EVENT_TYPE = Object.freeze({
    agent_start: "agent_start",
    queue_update: "queue_update",
    session_info_changed: "session_info_changed",
    message_start: {
        custom: "custom_message_start",
        user: "user_message_start",
        assistant: "assistant_message_start",
    },
    message_end: {
        user: undefined,
        default: "message_end",
    },
    tool_execution_start: "tool_execution_start",
    tool_execution_end: "tool_execution_end",
    agent_end: "agent_end",
    compaction_start: "compaction_start",
    compaction_end: "compaction_end",
    auto_retry_start: "auto_retry_start",
    auto_retry_end: "auto_retry_end",
});

export const PLANNED_EVENT_TYPES = Object.freeze(Object.keys(PLAN_REASON_BY_EVENT_TYPE));

export function getPlanRenderReason(eventType, role) {
    const reason = PLAN_REASON_BY_EVENT_TYPE[eventType];
    if (reason && typeof reason === "object") {
        return reason[role] ?? reason.default;
    }
    return reason;
}

export function isPlannedEventType(eventType) {
    return Object.prototype.hasOwnProperty.call(PLAN_REASON_BY_EVENT_TYPE, eventType);
}
