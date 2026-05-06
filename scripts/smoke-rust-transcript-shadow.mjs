import { assistantStopToolResult, compactionStatus, TranscriptStore } from "../transcript-store/transcript-store.mjs";

const command = process.env.PI_TRANSCRIPT_CORE_COMMAND;
if (!command) {
    throw new Error("Set PI_TRANSCRIPT_CORE_COMMAND to the Rust transcript core executable.");
}

process.env.PI_RUST_SHADOW = "1";
process.env.PI_RUST_SHADOW_STRICT = "1";

const previousVisible = process.env.PI_TUI_VISIBLE_TRANSCRIPT;
const previousMultiplier = process.env.PI_TUI_VISIBLE_TRANSCRIPT_MULTIPLIER;

const store = new TranscriptStore({
    ui: { terminal: { rows: 30 } },
    setTranscriptTailLines() {},
}, {});

process.env.PI_TUI_VISIBLE_TRANSCRIPT = "1";
process.env.PI_TUI_VISIBLE_TRANSCRIPT_MULTIPLIER = "2";
const visibleBudget = store.getVisibleTranscriptLineBudget();

process.env.PI_TUI_VISIBLE_TRANSCRIPT = "0";
const hiddenBudget = store.getVisibleTranscriptLineBudget();

if (previousVisible === undefined) {
    delete process.env.PI_TUI_VISIBLE_TRANSCRIPT;
}
else {
    process.env.PI_TUI_VISIBLE_TRANSCRIPT = previousVisible;
}
if (previousMultiplier === undefined) {
    delete process.env.PI_TUI_VISIBLE_TRANSCRIPT_MULTIPLIER;
}
else {
    process.env.PI_TUI_VISIBLE_TRANSCRIPT_MULTIPLIER = previousMultiplier;
}

const userText = store.getUserMessageText({
    role: "user",
    content: [{ type: "text", text: "a" }, { type: "image", text: "ignored" }, { type: "text", text: "b" }],
});
const visibleText = store.messageHasVisibleText({
    role: "assistant",
    content: [{ type: "text", text: "visible" }],
});
const toolCall = store.messageHasToolCall({
    role: "assistant",
    content: [{ type: "toolCall" }],
});
const abortText = assistantStopToolResult({ stopReason: "aborted", retryAttempt: 2 });
const errorText = assistantStopToolResult({ stopReason: "error", errorMessage: "Boom" });
const compacted = compactionStatus({ compactionCount: 2 });

console.log(JSON.stringify({
    ok: true,
    visibleBudget,
    hiddenBudget,
    userText,
    visibleText,
    toolCall,
    abortText,
    errorText,
    compacted,
}, null, 2));
