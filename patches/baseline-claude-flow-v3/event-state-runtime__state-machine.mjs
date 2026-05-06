import { reduceAgentLifecycle, createAgentLifecycleState } from "./agent-lifecycle.mjs";
import { planEventActions } from "./event-action-planner.mjs";
import { classifyEvent, getEventPhaseHint } from "./event-types.mjs";
import { reduceMessageLifecycle, createMessageLifecycleState } from "./message-lifecycle.mjs";
import { reduceStreamLifecycle, createStreamLifecycleState } from "./stream-lifecycle.mjs";
import { reduceToolLifecycle, createToolLifecycleState } from "./tool-lifecycle.mjs";

export class EventStateMachine {
    constructor(options = {}) {
        this.now = options.now ?? (() => Date.now());
        this.reset();
    }

    reset() {
        this.state = {
            sequence: 0,
            phase: "idle",
            lastEventType: undefined,
            lastEventGroup: undefined,
            agent: createAgentLifecycleState(),
            messages: createMessageLifecycleState(),
            tools: createToolLifecycleState(),
            stream: createStreamLifecycleState(),
        };
        this.lastTransition = undefined;
    }

    apply(event) {
        const now = this.now();
        const previousPhase = this.state.phase;
        const group = classifyEvent(event);
        const actions = [
            ...reduceAgentLifecycle(this.state.agent, event, now),
            ...reduceMessageLifecycle(this.state.messages, event),
            ...reduceToolLifecycle(this.state.tools, event),
            ...reduceStreamLifecycle(this.state.stream, event),
        ];
        this.state.sequence += 1;
        this.state.lastEventType = event?.type;
        this.state.lastEventGroup = group;
        this.state.phase = resolvePhase(event, this.state);
        const snapshot = this.snapshot();
        const plan = planEventActions(event, snapshot);
        this.lastTransition = {
            sequence: this.state.sequence,
            eventType: event?.type,
            eventGroup: group,
            phase: this.state.phase,
            previousPhase,
            phaseHint: getEventPhaseHint(event),
            actions,
            plan,
            snapshot,
        };
        return this.lastTransition;
    }

    snapshot() {
        return {
            sequence: this.state.sequence,
            phase: this.state.phase,
            lastEventType: this.state.lastEventType,
            lastEventGroup: this.state.lastEventGroup,
            agent: { ...this.state.agent },
            messages: {
                ...this.state.messages,
                byRole: clonePlainObject(this.state.messages.byRole),
            },
            tools: {
                starts: this.state.tools.starts,
                updates: this.state.tools.updates,
                ends: this.state.tools.ends,
                errors: this.state.tools.errors,
                activeCount: this.state.tools.active.size,
                active: [...this.state.tools.active.values()].map((tool) => ({ ...tool })),
                lastToolCallId: this.state.tools.lastToolCallId,
                lastToolName: this.state.tools.lastToolName,
            },
            stream: { ...this.state.stream },
        };
    }
}

function resolvePhase(event, state) {
    if (event?.type === "agent_end") {
        return "idle";
    }
    if (event?.type === "compaction_start") {
        return "compacting";
    }
    if (event?.type === "auto_retry_start") {
        return "retry_waiting";
    }
    if (state.tools.active.size > 0) {
        return "tool_active";
    }
    if (state.stream.assistantStreaming) {
        return "assistant_streaming";
    }
    if (state.agent.active) {
        return "agent_running";
    }
    return "idle";
}

function clonePlainObject(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, { ...item }]));
}
