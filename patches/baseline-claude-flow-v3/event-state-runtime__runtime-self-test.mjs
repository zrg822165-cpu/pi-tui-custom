import { HANDLED_EVENT_TYPES } from "./effect-registry.mjs";
import { createEffectResult } from "./effect-result.mjs";
import { createEffectCommand, executeEffectCommands } from "./effect-command.mjs";
import { EVENT_GROUPS } from "./event-types.mjs";
import { PLANNED_EVENT_TYPES } from "./plan-registry.mjs";
import { INTERACTIVE_HOST_REQUIRED_PATHS, validateInteractiveHost } from "./interactive-host-contract.mjs";
import { validateEffectCommandShape } from "./effect-command-contract.mjs";

export function getKnownEventTypes() {
    return Object.freeze([...new Set(Object.values(EVENT_GROUPS).flatMap((types) => [...types]))].sort());
}

export function checkEventRuntimeCoverage() {
    const known = getKnownEventTypes();
    return {
        known,
        handled: [...HANDLED_EVENT_TYPES].sort(),
        planned: [...PLANNED_EVENT_TYPES].sort(),
        missingHandlers: known.filter((type) => !HANDLED_EVENT_TYPES.includes(type)),
        missingPlans: known.filter((type) => !PLANNED_EVENT_TYPES.includes(type) && type !== "message_update" && type !== "tool_execution_update" && type !== "thinking_level_changed"),
        unclassifiedHandlers: HANDLED_EVENT_TYPES.filter((type) => !known.includes(type)).sort(),
        unclassifiedPlans: PLANNED_EVENT_TYPES.filter((type) => !known.includes(type)).sort(),
    };
}

export function runEventStateRuntimeSelfTest(options = {}) {
    const coverage = checkEventRuntimeCoverage();
    const commandShape = checkEffectCommandShape();
    const hostValidation = options.host ? validateInteractiveHost(options.host) : {
        ok: true,
        missing: [],
        checked: INTERACTIVE_HOST_REQUIRED_PATHS.length,
    };
    const ok = coverage.missingHandlers.length === 0 &&
        coverage.missingPlans.length === 0 &&
        coverage.unclassifiedHandlers.length === 0 &&
        coverage.unclassifiedPlans.length === 0 &&
        commandShape.ok &&
        hostValidation.ok;
    return {
        ok,
        coverage,
        commandShape,
        hostValidation,
    };
}

export function checkEffectCommandShape() {
    const missingCommands = [];
    for (const eventType of HANDLED_EVENT_TYPES) {
        const result = createEffectResult({ type: eventType }, { mutations: [eventType] });
        const shape = validateEffectCommandShape(createEffectCommand(eventType, { type: eventType }));
        if (!Array.isArray(result.commands) || !shape.ok) {
            missingCommands.push(eventType);
        }
    }
    return {
        ok: missingCommands.length === 0,
        missingCommands,
    };
}

export async function checkEffectCommandExecutor() {
    const calls = [];
    const host = {
        updatePendingMessagesDisplay: () => calls.push("pending"),
        updateTerminalTitle: () => calls.push("title"),
        updateEditorBorderColor: () => calls.push("border"),
        invalidateFooter: () => calls.push("footer"),
        requestRender: () => calls.push("render"),
    };
    const commands = [
        createEffectCommand("queue:update_pending_messages", { type: "self_test" }),
        createEffectCommand("terminal:update_title", { type: "self_test" }),
        createEffectCommand("footer:invalidate", { type: "self_test" }),
        createEffectCommand("editor:update_border_color", { type: "self_test" }),
        createEffectCommand("render:request", { type: "self_test" }),
    ];
    const result = await executeEffectCommands(host, commands);
    return {
        ok: result.executed === commands.length && calls.length === commands.length,
        executed: result.executed,
        calls,
    };
}
