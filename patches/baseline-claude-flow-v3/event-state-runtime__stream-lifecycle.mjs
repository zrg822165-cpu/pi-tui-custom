export function createStreamLifecycleState() {
    return {
        assistantStreaming: false,
        visibleAssistantTextStarted: false,
        messageUpdatesInStream: 0,
        toolEventsInStream: 0,
        lastPhase: "idle",
    };
}

export function reduceStreamLifecycle(state, event) {
    if (event?.type === "agent_start") {
        state.assistantStreaming = false;
        state.visibleAssistantTextStarted = false;
        state.messageUpdatesInStream = 0;
        state.toolEventsInStream = 0;
        state.lastPhase = "agent_running";
        return ["stream:agent_started"];
    }
    if (event?.type === "message_start" && event.message?.role === "assistant") {
        state.assistantStreaming = true;
        state.lastPhase = "assistant_started";
        return ["stream:assistant_started"];
    }
    if (event?.type === "message_update" && event.message?.role === "assistant") {
        state.assistantStreaming = true;
        state.messageUpdatesInStream += 1;
        state.visibleAssistantTextStarted = state.visibleAssistantTextStarted || hasVisibleText(event.message);
        state.lastPhase = "assistant_streaming";
        return ["stream:assistant_updated"];
    }
    if (event?.type === "message_end" && event.message?.role === "assistant") {
        state.assistantStreaming = false;
        state.visibleAssistantTextStarted = state.visibleAssistantTextStarted || hasVisibleText(event.message);
        state.lastPhase = "assistant_ended";
        return ["stream:assistant_ended"];
    }
    if (event?.type?.startsWith?.("tool_execution_")) {
        state.toolEventsInStream += 1;
        state.lastPhase = event.type === "tool_execution_end" ? "tool_result_handoff" : "tool_activity";
        return [`stream:${event.type}`];
    }
    if (event?.type === "agent_end") {
        state.assistantStreaming = false;
        state.lastPhase = "idle";
        return ["stream:agent_ended"];
    }
    return [];
}

function hasVisibleText(message) {
    return Boolean(message?.parts?.some?.((part) => part?.type === "text" && part.text?.trim?.()));
}
