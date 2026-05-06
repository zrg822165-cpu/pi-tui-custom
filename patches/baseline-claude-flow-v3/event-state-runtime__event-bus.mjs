export class EventBus {
    listeners = new Map();

    subscribe(type, listener) {
        const key = type ?? "*";
        const listeners = this.listeners.get(key) ?? new Set();
        listeners.add(listener);
        this.listeners.set(key, listeners);
        return () => this.unsubscribe(key, listener);
    }

    unsubscribe(type, listener) {
        const key = type ?? "*";
        const listeners = this.listeners.get(key);
        if (!listeners) {
            return;
        }
        listeners.delete(listener);
        if (listeners.size === 0) {
            this.listeners.delete(key);
        }
    }

    async emit(event) {
        const typed = [...(this.listeners.get(event?.type) ?? [])];
        const wildcard = [...(this.listeners.get("*") ?? [])];
        for (const listener of [...typed, ...wildcard]) {
            await listener(event);
        }
    }

    clear() {
        this.listeners.clear();
    }
}

