import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { createEffectResult } from "./effect-result.mjs";

export async function handleCompactionStart(host, event) {
    const mutations = [];
    const commands = [];
    if (host.shouldShowTerminalProgress()) {
        mutations.push("terminal:progress_on");
        commands.push(createEffectCommand("terminal:progress_on", event));
    }
    mutations.push("compaction:save_escape_handler");
    commands.push(createEffectCommand("compaction:save_escape_handler", event));
    mutations.push("compaction:set_abort_escape_handler");
    commands.push(createEffectCommand("compaction:set_abort_escape_handler", event));
    mutations.push("status:clear");
    commands.push(createEffectCommand("status:clear", event));
    mutations.push("status:compaction_loader_start");
    commands.push(createEffectCommand("status:compaction_loader_start", event, { reason: event.reason }));
    commands.push(createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}

export async function handleCompactionEnd(host, event) {
    const mutations = [];
    const commands = [];
    if (host.shouldShowTerminalProgress()) {
        mutations.push("terminal:progress_off");
        commands.push(createEffectCommand("terminal:progress_off", event));
    }
    if (host.hasCompactionEscapeHandler()) {
        mutations.push("compaction:restore_escape_handler");
        commands.push(createEffectCommand("compaction:restore_escape_handler", event));
    }
    if (host.hasCompactionLoader()) {
        mutations.push("status:compaction_loader_stop");
        commands.push(createEffectCommand("status:compaction_loader_stop", event));
    }
    if (event.aborted) {
        if (event.reason === "manual") {
            mutations.push("notice:manual_compaction_cancelled");
            commands.push(createEffectCommand("notice:manual_compaction_cancelled", event));
        }
        else {
            mutations.push("notice:auto_compaction_cancelled");
            commands.push(createEffectCommand("notice:auto_compaction_cancelled", event));
        }
    }
    else if (event.result) {
        mutations.push("transcript:clear_chat", "transcript:rebuild_from_messages", "transcript:add_compaction_summary", "footer:invalidate");
        commands.push(createEffectCommand("transcript:add_compaction_summary", event, { summary: event.result.summary, tokensBefore: event.result.tokensBefore }), createEffectCommand("footer:invalidate", event));
    }
    else if (event.errorMessage) {
        if (event.reason === "manual") {
            mutations.push("notice:manual_compaction_error");
            commands.push(createEffectCommand("notice:manual_compaction_error", event, { errorMessage: event.errorMessage }));
        }
        else {
            mutations.push("transcript:add_compaction_error");
            commands.push(createEffectCommand("transcript:add_compaction_error", event, { errorMessage: event.errorMessage }));
        }
    }
    mutations.push("compaction:flush_queue");
    commands.push(createEffectCommand("compaction:flush_queue", event, { willRetry: event.willRetry }), createEffectCommand("render:request", event));
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations,
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}
