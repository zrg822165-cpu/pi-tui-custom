export const STREAM_CONTROLLER_PROTOCOL_VERSION = 1;

export const STREAM_CONTROLLER_REQUIRED_METHODS = Object.freeze([
    "clear",
    "queueAssistantUpdate",
    "flushAssistantUpdate",
    "flushSmoothing",
    "getSnapshot",
]);

export function validateStreamController(controller) {
    const missing = [];
    for (const method of STREAM_CONTROLLER_REQUIRED_METHODS) {
        if (typeof controller?.[method] !== "function") {
            missing.push(method);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: STREAM_CONTROLLER_REQUIRED_METHODS.length,
    };
}

