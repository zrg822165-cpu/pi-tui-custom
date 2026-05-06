import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { createEffectResult } from "./effect-result.mjs";

export async function handleToolExecutionStart(host, event) {
    const baseArgs = { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args };
    const mutations = ["tool:create_pending", "tool:attach", "tool:mark_started", "tool_flow:update", "status:tool_executing"];
    const commands = [
        createEffectCommand("tool:create_pending_if_missing", event, baseArgs),
        createEffectCommand("tool:attach", event, baseArgs),
        createEffectCommand("tool:mark_started", event, baseArgs),
        createEffectCommand("tool_flow:update", event, baseArgs),
        createEffectCommand("status:tool_executing", event, baseArgs),
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

export async function handleToolExecutionUpdate(host, event) {
    if (host.hasPendingTool(event.toolCallId)) {
        const commands = [
            createEffectCommand("tool:queue_update", event, { toolCallId: event.toolCallId, event }),
        ];
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: false,
            mutations: ["tool:queue_update"],
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    return createEffectResult(event, {
        renderRequested: false,
        mutations: [],
        notes: ["tool_update_without_pending_component"],
    });
}

export async function handleToolExecutionEnd(host, event) {
    const baseArgs = { toolCallId: event.toolCallId, result: event.result, isError: event.isError };
    const mutations = ["tool:flush_updates"];
    const commands = [createEffectCommand("tool:flush_updates", event, baseArgs)];
    if (host.hasPendingTool(event.toolCallId)) {
        mutations.push("tool:attach", event.isError ? "tool:update_error_result" : "tool:update_result", "tool_flow:update", "status:tool_requesting", "tool:delete_pending");
        commands.push(createEffectCommand("tool:attach", event, baseArgs), createEffectCommand("tool:update_result", event, baseArgs), createEffectCommand("tool_flow:update", event, baseArgs), createEffectCommand("status:tool_requesting", event, baseArgs), createEffectCommand("tool:delete_pending", event, baseArgs), createEffectCommand("render:request", event));
        const execution = await executeEffectCommands(host, commands);
        return createEffectResult(event, {
            renderRequested: true,
            mutations,
            commands,
            notes: [`commands_executed:${execution.executed}`],
        });
    }
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: false,
        mutations,
        commands,
        notes: ["tool_end_without_pending_component"],
    });
}
