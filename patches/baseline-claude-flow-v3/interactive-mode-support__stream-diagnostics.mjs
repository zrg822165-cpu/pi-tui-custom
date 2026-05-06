import * as fs from "node:fs";
import * as path from "node:path";

export function getStreamingTextStats(message) {
    let textLength = 0;
    let thinkingLength = 0;
    let toolCalls = 0;
    const contentTypes = [];
    for (const content of message?.content ?? []) {
        contentTypes.push(content.type);
        if (content.type === "text") {
            textLength += content.text?.length ?? 0;
        }
        else if (content.type === "thinking") {
            thinkingLength += content.thinking?.length ?? 0;
        }
        else if (content.type === "toolCall") {
            toolCalls++;
        }
    }
    return { textLength, thinkingLength, toolCalls, contentTypes: contentTypes.join(",") };
}

export function recordStreamTiming(entry, options = {}) {
    const logPath = options.logPath ?? process.env.PI_TUI_STREAM_TIMING_LOG;
    if (!logPath) {
        return;
    }
    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify({
            ts: new Date().toISOString(),
            ...entry,
        }) + "\n");
    }
    catch {
        // Diagnostics must never affect streaming cadence.
    }
}

