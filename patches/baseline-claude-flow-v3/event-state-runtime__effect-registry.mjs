import { createEffectResult } from "./effect-result.mjs";
import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { handleAgentEnd, handleAgentStart } from "./agent-effects.mjs";
import { handleCompactionEnd, handleCompactionStart } from "./compaction-effects.mjs";
import { handleMessageEnd, handleMessageStart, handleMessageUpdate } from "./message-effects.mjs";
import { handleAutoRetryEnd, handleAutoRetryStart } from "./retry-effects.mjs";
import { handleToolExecutionEnd, handleToolExecutionStart, handleToolExecutionUpdate } from "./tool-effects.mjs";

export const EFFECT_HANDLER_BY_EVENT_TYPE = Object.freeze({
    agent_start: handleAgentStart,
    agent_end: handleAgentEnd,
    queue_update: handleQueueUpdate,
    session_info_changed: handleSessionInfoChanged,
    thinking_level_changed: handleThinkingLevelChanged,
    message_start: handleMessageStart,
    message_update: handleMessageUpdate,
    message_end: handleMessageEnd,
    tool_execution_start: handleToolExecutionStart,
    tool_execution_update: handleToolExecutionUpdate,
    tool_execution_end: handleToolExecutionEnd,
    compaction_start: handleCompactionStart,
    compaction_end: handleCompactionEnd,
    auto_retry_start: handleAutoRetryStart,
    auto_retry_end: handleAutoRetryEnd,
});

export const HANDLED_EVENT_TYPES = Object.freeze(Object.keys(EFFECT_HANDLER_BY_EVENT_TYPE));

export function getEffectHandler(eventType) {
    return EFFECT_HANDLER_BY_EVENT_TYPE[eventType];
}

export function isHandledEventType(eventType) {
    return Boolean(getEffectHandler(eventType));
}

async function handleQueueUpdate(host, event) {
    const commands = [
        createEffectCommand("queue:update_pending_messages", event),
        createEffectCommand("render:request", event),
    ];
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations: ["queue:update_pending_messages"],
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}

async function handleSessionInfoChanged(host, event) {
    const commands = [
        createEffectCommand("terminal:update_title", event),
        createEffectCommand("footer:invalidate", event),
        createEffectCommand("render:request", event),
    ];
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: true,
        mutations: ["terminal:update_title", "footer:invalidate"],
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}

async function handleThinkingLevelChanged(host, event) {
    const commands = [
        createEffectCommand("footer:invalidate", event),
        createEffectCommand("editor:update_border_color", event),
    ];
    const execution = await executeEffectCommands(host, commands);
    return createEffectResult(event, {
        renderRequested: false,
        mutations: ["footer:invalidate", "editor:update_border_color"],
        commands,
        notes: [`commands_executed:${execution.executed}`],
    });
}
