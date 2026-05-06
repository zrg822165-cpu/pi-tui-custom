export const EFFECT_COMMAND_VERSION = 1;

export function validateEffectCommandShape(command) {
    return {
        ok: !!command && command.version === EFFECT_COMMAND_VERSION && typeof command.type === "string",
        version: command?.version,
        type: command?.type,
    };
}

export function normalizeEffectCommandVersion(command = {}) {
    return {
        ...command,
        version: command.version ?? EFFECT_COMMAND_VERSION,
    };
}
