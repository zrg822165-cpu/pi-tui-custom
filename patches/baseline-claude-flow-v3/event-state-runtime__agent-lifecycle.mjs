export function createAgentLifecycleState() {
    return {
        active: false,
        starts: 0,
        ends: 0,
        lastStartedAt: undefined,
        lastEndedAt: undefined,
    };
}

export function reduceAgentLifecycle(state, event, now) {
    if (event?.type === "agent_start") {
        state.active = true;
        state.starts += 1;
        state.lastStartedAt = now;
        return ["agent:started"];
    }
    if (event?.type === "agent_end") {
        state.active = false;
        state.ends += 1;
        state.lastEndedAt = now;
        return ["agent:ended"];
    }
    return [];
}
