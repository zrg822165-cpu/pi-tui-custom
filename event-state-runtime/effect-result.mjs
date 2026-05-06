export const EFFECT_RESULT_VERSION = 1;
import { createEffectCommandsFromMutations, normalizeEffectCommands } from "./effect-command.mjs";

export function createEffectResult(event, overrides = {}) {
    const mutations = overrides.mutations ?? [];
    return {
        version: EFFECT_RESULT_VERSION,
        handled: overrides.handled ?? true,
        eventType: event?.type,
        renderRequested: overrides.renderRequested ?? false,
        mutations,
        commands: normalizeEffectCommands(event, overrides.commands ?? createEffectCommandsFromMutations(event, mutations)),
        notes: overrides.notes ?? [],
        error: overrides.error,
    };
}

export function createUnhandledEffectResult(event) {
    return createEffectResult(event, {
        handled: false,
        notes: ["unhandled_event"],
    });
}

export function createErrorEffectResult(event, error) {
    return createEffectResult(event, {
        handled: false,
        error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        },
        notes: ["effect_error"],
    });
}

export function normalizeEffectResult(event, result, fallback = {}) {
    if (result && typeof result === "object" && "handled" in result) {
        return {
            ...createEffectResult(event, fallback),
            ...result,
            eventType: result.eventType ?? event?.type,
        };
    }
    return createEffectResult(event, fallback);
}

export function markRenderRequested(result, reason) {
    return {
        ...result,
        renderRequested: true,
        notes: reason ? [...result.notes, `render:${reason}`] : result.notes,
    };
}
