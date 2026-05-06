import { getMessageRole } from "./event-types.mjs";

export function createMessageLifecycleState() {
    return {
        activeRole: undefined,
        activeMessageId: undefined,
        starts: 0,
        updates: 0,
        ends: 0,
        byRole: Object.create(null),
        lastRole: undefined,
        lastStopReason: undefined,
    };
}

function roleBucket(state, role) {
    const key = role ?? "unknown";
    state.byRole[key] ??= { starts: 0, updates: 0, ends: 0 };
    return state.byRole[key];
}

export function reduceMessageLifecycle(state, event) {
    const role = getMessageRole(event);
    if (event?.type === "message_start") {
        state.activeRole = role;
        state.activeMessageId = event.message?.id;
        state.starts += 1;
        state.lastRole = role;
        roleBucket(state, role).starts += 1;
        return [`message:${role ?? "unknown"}:started`];
    }
    if (event?.type === "message_update") {
        state.updates += 1;
        state.lastRole = role;
        roleBucket(state, role).updates += 1;
        return [`message:${role ?? "unknown"}:updated`];
    }
    if (event?.type === "message_end") {
        state.ends += 1;
        state.lastRole = role;
        state.lastStopReason = event.message?.stopReason;
        roleBucket(state, role).ends += 1;
        if (state.activeMessageId === event.message?.id || state.activeRole === role) {
            state.activeRole = undefined;
            state.activeMessageId = undefined;
        }
        return [`message:${role ?? "unknown"}:ended`];
    }
    return [];
}
