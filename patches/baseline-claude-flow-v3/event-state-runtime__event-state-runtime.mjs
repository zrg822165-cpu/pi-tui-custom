import { EventAdapter } from "./event-adapter.mjs";
import { EventBus } from "./event-bus.mjs";
import { EventStateMachine } from "./state-machine.mjs";

export class EventStateRuntime {
    constructor(options = {}) {
        this.bus = options.bus ?? new EventBus();
        this.adapter = options.adapter ?? new EventAdapter(options);
        this.stateMachine = options.stateMachine ?? new EventStateMachine(options);
        this.sourceUnsubscribe = undefined;
    }

    subscribe(type, listener) {
        return this.bus.subscribe(type, listener);
    }

    subscribeToSource(source, listener) {
        this.sourceUnsubscribe?.();
        this.sourceUnsubscribe = source.subscribe(async (event) => {
            await this.dispatch(event, listener);
        });
        return this.sourceUnsubscribe;
    }

    async dispatch(event, listener) {
        this.lastTransition = this.stateMachine.apply(event);
        await this.bus.emit(event);
        if (listener) {
            await listener(event);
        }
        return this.lastTransition;
    }

    toUiEvent(event, host) {
        return this.adapter.toUiEvent(event, host);
    }

    getSnapshot() {
        return this.stateMachine.snapshot();
    }

    getLastTransition() {
        return this.lastTransition;
    }

    dispose() {
        this.sourceUnsubscribe?.();
        this.sourceUnsubscribe = undefined;
        this.bus.clear();
        this.stateMachine.reset();
        this.lastTransition = undefined;
    }
}
