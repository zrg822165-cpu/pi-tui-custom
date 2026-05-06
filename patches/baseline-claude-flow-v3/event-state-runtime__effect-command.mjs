import { executeKnownCommand } from "./command-executors/index.mjs";
import { EFFECT_COMMAND_VERSION, normalizeEffectCommandVersion } from "./effect-command-contract.mjs";

export function createEffectCommand(type, event, args = {}) {
    return normalizeEffectCommandVersion({
        type,
        eventType: event?.type,
        args,
    });
}

export function createEffectCommandsFromMutations(event, mutations = []) {
    return mutations.map((mutation) => createEffectCommand(mutation, event));
}

export function normalizeEffectCommands(event, commands = []) {
    return commands.map((command) => {
        if (typeof command === "string") {
            return createEffectCommand(command, event);
        }
        return {
            version: command.version ?? EFFECT_COMMAND_VERSION,
            eventType: command.eventType ?? event?.type,
            args: command.args ?? {},
            ...command,
        };
    });
}

export async function executeEffectCommands(host, commands = []) {
    let executed = 0;
    const deferred = [];
    for (const command of commands) {
        if (await executeKnownCommand(host, command)) {
            executed += 1;
        }
        else {
            deferred.push(command);
        }
    }
    host.lastExecutedEffectCommands = commands;
    return {
        executed,
        deferred: deferred.length,
        commands,
        deferredCommands: deferred,
    };
}
