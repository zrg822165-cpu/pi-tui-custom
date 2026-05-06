import { TuiEventType } from "./events.mjs";

export function createInitialTuiViewState() {
    return {
        session: undefined,
        status: "idle",
        messagesStarted: 0,
        messagesEnded: 0,
        toolsRunning: new Set(),
        lastInput: undefined,
        lastEventType: undefined,
        updatedAt: Date.now(),
    };
}

export function reduceTuiViewState(state, event) {
    const next = {
        ...state,
        toolsRunning: new Set(state.toolsRunning),
        lastEventType: event.type,
        updatedAt: event.timestamp ?? Date.now(),
    };
    if (event.session) {
        next.session = event.session;
    }
    switch (event.type) {
        case TuiEventType.SESSION_LOADED:
        case TuiEventType.SESSION_SWITCHED:
            next.session = event.session;
            next.status = "idle";
            next.toolsRunning.clear();
            break;
        case TuiEventType.INPUT_SUBMIT:
            next.lastInput = event.text;
            break;
        case TuiEventType.MESSAGE_START:
            next.messagesStarted++;
            next.status = "streaming";
            break;
        case TuiEventType.MESSAGE_END:
            next.messagesEnded++;
            if (next.toolsRunning.size === 0) {
                next.status = "idle";
            }
            break;
        case TuiEventType.TOOL_START:
            if (event.toolCallId) {
                next.toolsRunning.add(event.toolCallId);
            }
            next.status = "tool";
            break;
        case TuiEventType.TOOL_END:
            if (event.toolCallId) {
                next.toolsRunning.delete(event.toolCallId);
            }
            next.status = next.toolsRunning.size > 0 ? "tool" : "streaming";
            break;
        case TuiEventType.STATUS_UPDATE:
            next.status = event.status === "agent_end" ? "idle" : event.status ?? next.status;
            break;
        case TuiEventType.ERROR:
            next.status = "error";
            break;
    }
    return next;
}

export function serializeTuiViewState(state) {
    return {
        ...state,
        toolsRunning: [...state.toolsRunning],
    };
}

