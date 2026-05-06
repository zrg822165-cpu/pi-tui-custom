import { EventAdapter } from "./event-adapter.mjs";
import { EventBus } from "./event-bus.mjs";
import { EventStateRuntime } from "./event-state-runtime.mjs";
import { EventStateMachine } from "./state-machine.mjs";

export function createEventStateRuntime(options = {}) {
    return new EventStateRuntime({
        ...options,
        bus: options.bus ?? new EventBus(),
        adapter: options.adapter ?? new EventAdapter(options),
        stateMachine: options.stateMachine ?? new EventStateMachine(options),
    });
}
