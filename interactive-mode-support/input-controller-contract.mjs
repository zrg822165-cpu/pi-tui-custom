export const INPUT_CONTROLLER_PROTOCOL_VERSION = 1;

export const INPUT_CONTROLLER_REQUIRED_METHODS = Object.freeze([
    "submit",
    "abort",
    "handlePaste",
    "setMode",
    "getSnapshot",
]);

export function validateInputController(controller) {
    const missing = [];
    for (const method of INPUT_CONTROLLER_REQUIRED_METHODS) {
        if (typeof controller?.[method] !== "function") {
            missing.push(method);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: INPUT_CONTROLLER_REQUIRED_METHODS.length,
    };
}

