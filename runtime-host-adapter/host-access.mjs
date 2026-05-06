export function getSessionStore(host) {
    return host?.sessionStore;
}

export function getSession(host) {
    return host?.session ?? host?.sessionStore?.session ?? host?.sessionStore;
}

export function getAgent(host) {
    return host?.agent ?? host?.sessionStore?.session?.agent ?? host?.sessionStore?.agent;
}

export function getSessionManager(host) {
    return host?.sessionManager ?? host?.sessionStore?.sessionManager ?? host?.sessionStore?.getSessionManagerAdapter?.();
}
