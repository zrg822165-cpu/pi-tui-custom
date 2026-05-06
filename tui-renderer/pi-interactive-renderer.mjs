import { TuiEventType } from "./events.mjs";
import { createInitialTuiViewState, reduceTuiViewState, serializeTuiViewState } from "./view-state.mjs";

export class PiInteractiveRendererFacade {
    mode;
    actions = {};
    events = [];
    viewState = createInitialTuiViewState();
    constructor(mode) {
        this.mode = mode;
    }
    bind(actions) {
        this.actions = actions ?? {};
    }
    start() {
        this.dispatch({
            type: TuiEventType.SESSION_LOADED,
            session: this.getSessionSnapshot(),
        });
    }
    stop() {
        this.events.length = 0;
    }
    dispatch(event) {
        const normalizedEvent = { ...event, timestamp: event.timestamp ?? Date.now() };
        this.viewState = reduceTuiViewState(this.viewState, normalizedEvent);
        this.events.push(normalizedEvent);
        if (this.events.length > 200) {
            this.events.splice(0, this.events.length - 200);
        }
    }
    getSessionSnapshot() {
        const session = this.mode?.session;
        const manager = this.mode?.sessionManager;
        return {
            id: manager?.getSessionId?.(),
            name: manager?.getSessionName?.(),
            cwd: manager?.getCwd?.(),
            file: manager?.getSessionFile?.(),
            isStreaming: session?.isStreaming ?? false,
            isBashRunning: session?.isBashRunning ?? false,
        };
    }
    getSnapshot() {
        return {
            session: this.getSessionSnapshot(),
            viewState: serializeTuiViewState(this.viewState),
            recentEvents: [...this.events],
        };
    }
}

export function attachPiInteractiveRenderer(mode, actions = {}) {
    const renderer = new PiInteractiveRendererFacade(mode);
    renderer.bind(actions);
    renderer.start();
    return renderer;
}
