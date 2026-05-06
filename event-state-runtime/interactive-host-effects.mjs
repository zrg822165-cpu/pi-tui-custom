import { getEffectHandler } from "./effect-registry.mjs";
import { createErrorEffectResult, createUnhandledEffectResult, normalizeEffectResult } from "./effect-result.mjs";

export async function handleInteractiveHostEvent(host, event) {
    try {
        const handler = getEffectHandler(event?.type);
        if (!handler) {
            const result = createUnhandledEffectResult(event);
            host.lastInteractiveHostEffectResult = result;
            return false;
        }
        const result = normalizeEffectResult(event, await handler(host, event), {
            renderRequested: isRenderRequestingEvent(event?.type),
            mutations: [event?.type].filter(Boolean),
        });
        host.lastInteractiveHostEffectResult = result;
        return result.handled;
    }
    catch (error) {
        const result = createErrorEffectResult(event, error);
        host.lastInteractiveHostEffectResult = result;
        host.lastInteractiveHostEffectError = {
            eventType: event?.type,
            message: result.error.message,
            stack: result.error.stack,
        };
        throw error;
    }
}

function isRenderRequestingEvent(eventType) {
    return !new Set([
        "message_update",
        "tool_execution_update",
        "thinking_level_changed",
    ]).has(eventType);
}
