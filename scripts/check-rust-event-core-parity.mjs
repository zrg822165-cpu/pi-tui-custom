import { spawnSync } from "node:child_process";
import { planEventActions } from "../event-state-runtime/event-action-planner.mjs";

const exe = process.env.PI_EVENT_CORE_COMMAND;
if (!exe) {
    throw new Error("Set PI_EVENT_CORE_COMMAND to the Rust event core executable.");
}

function rust(event, snapshot = {}) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op: "planEventActions", input: { ...event, snapshot } }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust event core failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout).value;
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
}

function assertEqual(name, actual, expected) {
    const actualJson = JSON.stringify(stable(actual));
    const expectedJson = JSON.stringify(stable(expected));
    if (actualJson !== expectedJson) {
        throw new Error(`${name} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
    }
}

const cases = [
    [{ type: "agent_start" }, { phase: "idle" }],
    [{ type: "queue_update" }, { phase: "agent_running" }],
    [{ type: "session_info_changed" }, { phase: "idle" }],
    [{ type: "thinking_level_changed" }, { phase: "idle" }],
    [{ type: "message_start", message: { id: "u1", role: "user" } }, { phase: "agent_running" }],
    [{ type: "message_start", message: { id: "a1", role: "assistant" } }, { phase: "agent_running" }],
    [{ type: "message_update", message: { id: "a1", role: "assistant" } }, { phase: "assistant_streaming" }],
    [{ type: "message_end", message: { id: "a1", role: "assistant", stopReason: "end_turn" } }, { phase: "assistant_streaming" }],
    [{ type: "message_end", message: { id: "a1", role: "assistant", stopReason: "aborted" } }, { phase: "assistant_streaming" }],
    [{ type: "tool_execution_start", toolCallId: "t1", toolName: "bash" }, { phase: "agent_running" }],
    [{ type: "tool_execution_update", toolCallId: "t1" }, { phase: "tool_active" }],
    [{ type: "tool_execution_end", toolCallId: "t1", isError: true }, { phase: "tool_active" }],
    [{ type: "agent_end" }, { phase: "agent_running" }],
    [{ type: "compaction_start" }, { phase: "agent_running" }],
    [{ type: "compaction_end" }, { phase: "compacting" }],
    [{ type: "auto_retry_start" }, { phase: "idle" }],
    [{ type: "auto_retry_end" }, { phase: "retry_waiting" }],
    [{ type: "unknown_event" }, { phase: "idle" }],
];

for (const [event, snapshot] of cases) {
    assertEqual(event.type, rust(event, snapshot), planEventActions(event, snapshot));
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
