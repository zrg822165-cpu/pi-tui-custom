import { getToolCallId } from "./event-types.mjs";

export function createToolLifecycleState() {
    return {
        active: new Map(),
        starts: 0,
        updates: 0,
        ends: 0,
        errors: 0,
        lastToolCallId: undefined,
        lastToolName: undefined,
    };
}

export function reduceToolLifecycle(state, event) {
    const toolCallId = getToolCallId(event);
    if (event?.type === "tool_execution_start") {
        state.starts += 1;
        state.lastToolCallId = toolCallId;
        state.lastToolName = event.toolName;
        if (toolCallId) {
            state.active.set(toolCallId, {
                id: toolCallId,
                name: event.toolName,
                updates: 0,
                started: true,
            });
        }
        return ["tool:started"];
    }
    if (event?.type === "tool_execution_update") {
        state.updates += 1;
        state.lastToolCallId = toolCallId;
        const active = toolCallId ? state.active.get(toolCallId) : undefined;
        if (active) {
            active.updates += 1;
        }
        return ["tool:updated"];
    }
    if (event?.type === "tool_execution_end") {
        state.ends += 1;
        state.lastToolCallId = toolCallId;
        if (event.isError) {
            state.errors += 1;
        }
        if (toolCallId) {
            state.active.delete(toolCallId);
        }
        return [event.isError ? "tool:errored" : "tool:ended"];
    }
    return [];
}
