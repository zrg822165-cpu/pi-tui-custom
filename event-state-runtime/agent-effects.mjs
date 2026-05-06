import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { createEffectResult } from "./effect-result.mjs";

export async function handleAgentStart(host, event) {
    const mutations = ["editor:assistant_activity_on"];
    const commands = [createEffectCommand("editor:assistant_activity_on", event)];
    if (host.shouldShowTerminalProgress()) {
        mutations.push("terminal:progress_on");
        commands.push(createEffectCommand("terminal:progress_on", event));
    }
    if (host.hasRetryEscapeHandler()) {
        mutations.push("retry:restore_escape_handler");
        commands.push(createEffectCommand("retry:restore_escape_handler", event));
    }
    if (host.hasRetryCountdown()) {
        mutations.push("retry:countdown_dispose");
        commands.push(createEffectCommand("retry:countdown_dispose", event));
    }
    if (host.hasRetryLoader()) {
        mutations.push("retry:loader_stop");
        commands.push(createEffectCommand("retry:loader_stop", event));
    }
    if (host.shouldStartWorkingLoader()) {
        mutations.push("status:working_loader_start");
        commands.push(createEffectCommand("status:working_loader_start", event));
    }
    mutations.push("status:tool_thinking_stop");
    commands.push(createEffectCommand("status:tool_thinking_stop", event), createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}

export async function handleAgentEnd(host, event) {
    const mutations = ["editor:assistant_activity_off"];
    const commands = [createEffectCommand("editor:assistant_activity_off", event)];
    if (host.shouldShowTerminalProgress()) {
        mutations.push("terminal:progress_off");
        commands.push(createEffectCommand("terminal:progress_off", event));
    }
    if (host.hasWorkingLoader()) {
        mutations.push("status:loader_stop");
        commands.push(createEffectCommand("status:loader_stop", event));
    }
    mutations.push("status:tool_thinking_stop");
    commands.push(createEffectCommand("status:tool_thinking_stop", event));
    mutations.push("transcript:assistant_stream_remove");
    commands.push(createEffectCommand("transcript:assistant_stream_remove", event));
    mutations.push("tool_flow:clear");
    commands.push(createEffectCommand("tool_flow:clear", event));
    mutations.push("transcript:tail_rendering_off");
    commands.push(createEffectCommand("transcript:tail_rendering_off", event));
    mutations.push("shutdown:check");
    commands.push(createEffectCommand("shutdown:check", event), createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}
