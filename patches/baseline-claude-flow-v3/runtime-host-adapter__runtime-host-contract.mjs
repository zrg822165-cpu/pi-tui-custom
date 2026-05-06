export const RUNTIME_HOST_ADAPTER_PROTOCOL_VERSION = 1;

export const RUNTIME_HOST_ADAPTER_REQUIRED_ACCESSORS = Object.freeze([
    "getSession",
    "getAgent",
    "getSessionManager",
    "getSessionStore",
]);

export const RUNTIME_HOST_ADAPTER_SURFACE = Object.freeze({
    accessors: [...RUNTIME_HOST_ADAPTER_REQUIRED_ACCESSORS],
});

export function validateRuntimeHostAdapter(host, options = {}) {
    const requiredAccessors = options.requiredAccessors ?? RUNTIME_HOST_ADAPTER_REQUIRED_ACCESSORS;
    const missing = [];
    for (const accessor of requiredAccessors) {
        if (typeof host?.[accessor] !== "function") {
            missing.push(accessor);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: requiredAccessors.length,
    };
}
