import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { createEffectResult } from "./effect-result.mjs";

export async function handleAutoRetryStart(host, event) {
    const mutations = [];
    const commands = [];
    mutations.push("retry:save_escape_handler");
    commands.push(createEffectCommand("retry:save_escape_handler", event));
    mutations.push("retry:set_abort_escape_handler");
    commands.push(createEffectCommand("retry:set_abort_escape_handler", event));
    mutations.push("status:clear");
    commands.push(createEffectCommand("status:clear", event));
    mutations.push("retry:countdown_dispose_existing");
    commands.push(createEffectCommand("retry:countdown_dispose_existing", event));
    mutations.push("status:retry_loader_start", "retry:countdown_start");
    commands.push(createEffectCommand("status:retry_loader_start", event, { attempt: event.attempt, maxAttempts: event.maxAttempts, delayMs: event.delayMs }), createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}

export async function handleAutoRetryEnd(host, event) {
    const mutations = [];
    const commands = [];
    if (host.hasRetryEscapeHandler()) {
        mutations.push("retry:restore_escape_handler");
        commands.push(createEffectCommand("retry:restore_escape_handler", event));
    }
    if (host.hasRetryCountdown()) {
        mutations.push("retry:countdown_dispose");
        commands.push(createEffectCommand("retry:countdown_dispose", event));
    }
    if (host.hasRetryLoader()) {
        mutations.push("status:retry_loader_stop");
        commands.push(createEffectCommand("status:retry_loader_stop", event));
    }
    if (!event.success) {
        mutations.push("notice:retry_failed");
        commands.push(createEffectCommand("notice:retry_failed", event, { attempt: event.attempt, finalError: event.finalError }));
    }
    commands.push(createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}
