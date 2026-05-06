import { SessionStore } from "./session-store.mjs";

export function createSessionStore(runtimeHost) {
    return new SessionStore(runtimeHost);
}

