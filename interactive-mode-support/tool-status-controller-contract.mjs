export const TOOL_STATUS_CONTROLLER_PROTOCOL_VERSION = 1;

export const TOOL_STATUS_CONTROLLER_REQUIRED_METHODS = Object.freeze([
    "ensureThinkingStatus",
    "markToolActivity",
    "setPhase",
    "stopThinkingStatus",
    "updateToolFlow",
    "resetToolFlow",
    "getSnapshot",
]);

export function validateToolStatusController(controller) {
    const missing = [];
    for (const method of TOOL_STATUS_CONTROLLER_REQUIRED_METHODS) {
        if (typeof controller?.[method] !== "function") {
            missing.push(method);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: TOOL_STATUS_CONTROLLER_REQUIRED_METHODS.length,
    };
}

