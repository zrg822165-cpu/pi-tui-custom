export class EventAdapter {
    constructor(options = {}) {
        this.toTuiEvent = options.toTuiEvent;
    }

    toUiEvent(event, host) {
        return this.toTuiEvent ? this.toTuiEvent(event, host) : event;
    }
}

