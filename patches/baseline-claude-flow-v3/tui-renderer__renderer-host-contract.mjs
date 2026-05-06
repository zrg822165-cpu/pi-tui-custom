export const RENDERER_HOST_PROTOCOL_VERSION = 1;

export const RENDERER_HOST_REQUIRED_METHODS = Object.freeze([
    "appendChat",
    "appendPending",
    "appendStatus",
    "attachMainLayout",
    "clearChat",
    "clearPending",
    "clearStatus",
    "invalidate",
    "requestRender",
    "setEditorComponent",
    "setFooter",
    "setFocus",
    "setHeader",
    "setStatus",
    "setTranscriptTailLines",
]);

export const RENDERER_HOST_OPTIONAL_METHODS = Object.freeze([
    "forEachChatChild",
    "getChatChildren",
    "getParts",
    "hasChatChildren",
    "removeChat",
    "removePending",
    "replaceHeaderComponent",
    "setWidgetSlot",
]);

export function validateRendererHost(host, options = {}) {
    const requiredMethods = options.requiredMethods ?? RENDERER_HOST_REQUIRED_METHODS;
    const missing = [];
    for (const method of requiredMethods) {
        if (typeof host?.[method] !== "function") {
            missing.push(method);
        }
    }
    return {
        ok: missing.length === 0,
        missing,
        checked: requiredMethods.length,
    };
}

export function assertRendererHost(host, options = {}) {
    const result = validateRendererHost(host, options);
    if (!result.ok) {
        throw new Error(`Renderer host contract missing: ${result.missing.join(", ")}`);
    }
    return result;
}
