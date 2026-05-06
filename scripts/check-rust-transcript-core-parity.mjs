import { spawnSync } from "node:child_process";

const exe = process.env.PI_TRANSCRIPT_CORE_COMMAND;
if (!exe) {
    throw new Error("Set PI_TRANSCRIPT_CORE_COMMAND to the Rust transcript core executable.");
}

function rust(op, input) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust transcript core failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout).value;
}

function assertEqual(name, actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${name} mismatch\nactual:   ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`);
    }
}

function visibleTranscriptLineBudget({ enabled, terminalRows, multiplier }) {
    if (!enabled) return undefined;
    const rows = Math.max(24, terminalRows ?? 24);
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 4;
    return Math.max(rows, Math.ceil(rows * safeMultiplier));
}

function userMessageText(message) {
    if (message.role !== "user") return "";
    const textBlocks = typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : message.content.filter((content) => content.type === "text");
    return textBlocks.map((content) => content.text).join("");
}

function messageHasVisibleText(message) {
    return message?.content?.some((content) => content.type === "text" && content.text.trim()) ?? false;
}

function messageHasToolCall(message) {
    return message?.content?.some((content) => content.type === "toolCall") ?? false;
}

function compactionStatus({ compactionCount }) {
    const times = compactionCount === 1 ? "1 time" : `${compactionCount} times`;
    return `Session compacted ${times}`;
}

function assistantStopToolResult({ stopReason, retryAttempt = 0, errorMessage }) {
    if (stopReason === "aborted") {
        return retryAttempt > 0
            ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
            : "Operation aborted";
    }
    return errorMessage || "Error";
}

const cases = [
    ["visibleTranscriptLineBudget", { enabled: false, terminalRows: 40, multiplier: 4 }, visibleTranscriptLineBudget],
    ["visibleTranscriptLineBudget", { enabled: true, terminalRows: 10, multiplier: 2 }, visibleTranscriptLineBudget],
    ["visibleTranscriptLineBudget", { enabled: true, terminalRows: 30, multiplier: -1 }, visibleTranscriptLineBudget],
    ["userMessageText", { role: "user", content: "hello" }, userMessageText],
    ["userMessageText", { role: "user", content: [{ type: "text", text: "a" }, { type: "image", text: "ignored" }, { type: "text", text: "b" }] }, userMessageText],
    ["userMessageText", { role: "assistant", content: [{ type: "text", text: "no" }] }, userMessageText],
    ["messageHasVisibleText", { role: "assistant", content: [{ type: "text", text: "  " }, { type: "toolCall" }] }, messageHasVisibleText],
    ["messageHasVisibleText", { role: "assistant", content: [{ type: "text", text: "visible" }] }, messageHasVisibleText],
    ["messageHasToolCall", { role: "assistant", content: [{ type: "toolCall" }] }, messageHasToolCall],
    ["compactionStatus", { compactionCount: 1 }, compactionStatus],
    ["compactionStatus", { compactionCount: 3 }, compactionStatus],
    ["assistantStopToolResult", { stopReason: "aborted", retryAttempt: 0 }, assistantStopToolResult],
    ["assistantStopToolResult", { stopReason: "aborted", retryAttempt: 2 }, assistantStopToolResult],
    ["assistantStopToolResult", { stopReason: "error", errorMessage: "Boom" }, assistantStopToolResult],
    ["assistantStopToolResult", { stopReason: "error" }, assistantStopToolResult],
];

for (const [name, input, expectedFn] of cases) {
    const expected = expectedFn(input);
    assertEqual(name, rust(name, input), expected === undefined ? null : expected);
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
