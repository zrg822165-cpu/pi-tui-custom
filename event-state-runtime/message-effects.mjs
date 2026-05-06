import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { createEffectResult } from "./effect-result.mjs";

export async function handleMessageStart(host, event) {
    if (event.message.role === "custom") {
        const mutations = ["transcript:add_custom_message"];
        const commands = [
            createEffectCommand("transcript:add_message", event, { message: event.message }),
            createEffectCommand("render:request", event),
        ];
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: true,
            mutations,
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    else if (event.message.role === "user") {
        const mutations = ["transcript:tail_rendering_on", "tool_flow:reset", "transcript:add_user_message", "queue:update_pending_messages"];
        const commands = [
            createEffectCommand("transcript:tail_rendering_on", event),
            createEffectCommand("tool_flow:reset", event),
            createEffectCommand("transcript:add_message", event, { message: event.message }),
            createEffectCommand("queue:update_pending_messages", event),
            createEffectCommand("render:request", event),
        ];
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: true,
            mutations,
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    else if (event.message.role === "assistant") {
        const mutations = ["transcript:tail_rendering_on", "transcript:assistant_stream_start"];
        const commands = [
            createEffectCommand("transcript:tail_rendering_on", event),
            createEffectCommand("transcript:assistant_stream_start", event, { message: event.message }),
        ];
        if (host.shouldShowThinkingStatus()) {
            mutations.push("status:tool_thinking_requesting");
            commands.push(createEffectCommand("status:tool_thinking_requesting", event));
        }
        else {
            mutations.push("status:response_loader_start");
            commands.push(createEffectCommand("status:response_loader_start", event));
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
    return createEffectResult(event, {
        renderRequested: false,
        mutations: [],
        notes: [`unsupported_message_role:${event.message.role}`],
    });
}

export async function handleMessageUpdate(host, event) {
    if (host.hasStreamingAssistant() && event.message.role === "assistant") {
        const commands = [
            createEffectCommand("transcript:assistant_stream_queue_update", event, { event }),
        ];
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: false,
            mutations: ["transcript:assistant_stream_queue_update"],
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    return createEffectResult(event, {
        renderRequested: false,
        mutations: [],
        notes: ["message_update_without_streaming_component"],
    });
}

export async function handleMessageEnd(host, event) {
    if (event.message.role === "user") {
        return createEffectResult(event, {
            renderRequested: false,
            mutations: [],
            notes: ["user_message_end_noop"],
        });
    }
    const mutations = [];
    const commands = [];
    if (host.hasStreamingAssistant() && event.message.role === "assistant") {
        commands.push(createEffectCommand("transcript:assistant_stream_flush", event));
        mutations.push("transcript:assistant_stream_flush");
        commands.push(createEffectCommand("transcript:set_streaming_message", event, { message: event.message }));
        mutations.push("transcript:set_streaming_message");
        let errorMessage;
        if (event.message.stopReason === "aborted") {
            const retryAttempt = host.getRetryAttempt();
            errorMessage =
                retryAttempt > 0
                    ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
                    : "Operation aborted";
            commands.push(createEffectCommand("transcript:set_abort_error_message", event, { errorMessage }));
            mutations.push("transcript:set_abort_error_message");
        }
        commands.push(createEffectCommand("transcript:assistant_stream_update_content", event));
        mutations.push("transcript:assistant_stream_update_content");
        if (event.message.stopReason === "aborted" || event.message.stopReason === "error") {
            if (!errorMessage) {
                errorMessage = event.message.errorMessage || "Error";
            }
            commands.push(createEffectCommand("tool:mark_pending_error", event, { errorMessage }));
            mutations.push("tool:mark_pending_error", "tool_flow:update");
            commands.push(createEffectCommand("tool:clear_pending", event));
            mutations.push("tool:clear_pending");
        }
        else {
            commands.push(createEffectCommand("tool:finalize_pending_args", event));
            mutations.push("tool:finalize_pending_args", "tool_flow:update");
            commands.push(createEffectCommand("status:tool_thinking_stop_if_visible_text", event));
            mutations.push("status:tool_thinking_stop_if_visible_text");
        }
        commands.push(createEffectCommand("transcript:assistant_stream_finish", event));
        mutations.push("transcript:assistant_stream_finish");
        commands.push(createEffectCommand("footer:invalidate", event));
        mutations.push("footer:invalidate");
        commands.push(createEffectCommand("render:request", event));
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: true,
            mutations,
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    return createEffectResult(event, {
        renderRequested: false,
        mutations,
        commands,
        notes: mutations.length === 0 ? ["message_end_without_streaming_component"] : [],
    });
}
