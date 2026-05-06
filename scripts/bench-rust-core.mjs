import { performance } from "node:perf_hooks";
import { runNativeCoreBatch, runNativeCoreValue } from "../rust-core-shadow/native-loader.mjs";

const iterations = Number.parseInt(process.env.PI_BENCH_ITERATIONS ?? "", 10) || 5;

function measure(name, fn) {
    const samples = [];
    let last;
    for (let index = 0; index < iterations; index++) {
        const started = performance.now();
        last = fn();
        samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return {
        name,
        iterations,
        minMs: round(samples[0]),
        medianMs: round(samples[Math.floor(samples.length / 2)]),
        maxMs: round(samples[samples.length - 1]),
        last,
    };
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function expectNative(result, name) {
    if (!result.ok) {
        throw new Error(`${name} failed: ${JSON.stringify(result)}`);
    }
    return result.values ?? result.value;
}

function buildRipgrepLines(count) {
    return Array.from({ length: count }, (_, index) => JSON.stringify({
        type: "match",
        data: {
            path: { text: `src/file-${index % 100}.rs` },
            line_number: index + 1,
            lines: { text: `fn item_${index}() { println!("needle ${index}"); }\n` },
        },
    }));
}

function buildSearchContextOps(count) {
    const fileLines = Array.from({ length: 2000 }, (_, index) => `let value_${index} = ${index};`);
    return Array.from({ length: count }, (_, index) => ({
        core: "search",
        op: "formatBlockContext",
        input: {
            relativePath: `src/file-${index % 20}.rs`,
            lineNumber: (index % 1990) + 5,
            contextValue: 2,
            fileLines,
        },
    }));
}

function buildLongTranscriptOps(count) {
    return Array.from({ length: count }, (_, index) => ({
        core: "transcript",
        op: index % 3 === 0 ? "messageHasVisibleText" : index % 3 === 1 ? "messageHasToolCall" : "userMessageText",
        input: index % 3 === 2
            ? { role: "user", content: [{ type: "text", text: `task ${index}` }, { type: "image", source: "ignored" }] }
            : { role: "assistant", content: [{ type: "text", text: index % 2 === 0 ? `visible ${index}` : "  " }, { type: "toolCall", id: `${index}` }] },
    }));
}

function buildQueueOps(count) {
    const queuedMessages = Array.from({ length: count }, (_, index) => ({
        text: `queued task ${index}`,
        mode: index % 3 === 0 ? "steer" : "followUp",
    }));
    return [{
        core: "queue",
        op: "planCompactionFlush",
        input: {
            queuedMessages,
            willRetry: false,
            extensionCommandFlags: queuedMessages.map((_message, index) => index % 17 === 0),
        },
    }];
}

function buildPatchOps(count) {
    const previousLines = Array.from({ length: count }, (_, index) => `line ${index}`);
    const newLines = previousLines.map((line, index) => index % 97 === 0 ? `${line} changed` : line);
    return [
        {
            core: "patch",
            op: "findChangedRange",
            input: {
                previousLines,
                newLines,
                height: 40,
                previousViewportTop: Math.max(0, count - 40),
            },
        },
        {
            core: "patch",
            op: "buildDiffRenderPatch",
            input: {
                firstChanged: 0,
                renderEnd: Math.min(count - 1, 300),
                appendStart: false,
                prevViewportTop: 0,
                viewportTop: 0,
                hardwareCursorRow: 0,
                height: 40,
                newLines,
                previousLineCount: previousLines.length,
            },
        },
    ];
}

function buildFramePlanInput(count) {
    const previousLines = Array.from({ length: count }, (_, index) => `line ${index}`);
    const newLines = previousLines.map((line, index) => index % 97 === 0 ? `${line} changed` : line);
    return {
        terminalWidth: 120,
        terminalHeight: 40,
        previousWidth: 120,
        previousHeight: 40,
        previousViewportTop: Math.max(0, count - 40),
        hardwareCursorRow: Math.max(0, count - 1),
        previousLines,
        newLines,
        isTermux: false,
        clearOnShrink: false,
        maxLinesRendered: count,
        hasOverlays: false,
    };
}

const rgLines = buildRipgrepLines(10_000);
const reports = [
    measure("rg JSON parse 10k lines single-call loop", () => rgLines.reduce((matches, line) => {
        const value = expectNative(runNativeCoreValue({
            core: "search",
            op: "parseRipgrepJsonLine",
            input: { line },
        }), "parseRipgrepJsonLine");
        return matches + (value.isMatchEvent ? 1 : 0);
    }, 0)),
    measure("rg JSON parse 10k lines batch", () => expectNative(runNativeCoreValue({
        core: "search",
        op: "parseRipgrepJsonLines",
        input: { lines: rgLines },
    }), "parseRipgrepJsonLines").filter((value) => value.isMatchEvent).length),
    measure("context block formatting repeated payload 2k", () => expectNative(runNativeCoreBatch(buildSearchContextOps(2_000)), "context repeated batch").length),
    measure("context block formatting grouped batch 2k", () => {
        const fileLines = Array.from({ length: 2000 }, (_, index) => `let value_${index} = ${index};`);
        const matches = Array.from({ length: 2_000 }, (_, index) => ({
            relativePath: `src/file-${index % 20}.rs`,
            filePath: `src/file-${index % 20}.rs`,
            lineNumber: (index % 1990) + 5,
        }));
        const fileLinesByPath = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`src/file-${index}.rs`, fileLines]));
        return expectNative(runNativeCoreValue({
            core: "search",
            op: "formatContextMatches",
            input: { matches, contextValue: 2, fileLinesByPath },
        }), "context grouped batch").outputLines.length;
    }),
    measure("long transcript policy batch 5k", () => expectNative(runNativeCoreBatch(buildLongTranscriptOps(5_000)), "transcript batch").length),
    measure("queue compaction flush plan 2k", () => expectNative(runNativeCoreBatch(buildQueueOps(2_000)), "queue batch")[0].steps.length),
    measure("render frame diff plan 20k lines", () => expectNative(runNativeCoreBatch(buildPatchOps(20_000)), "patch batch").length),
    measure("render frame pipeline plan 20k lines", () => expectNative(runNativeCoreValue({
        core: "patch",
        op: "planFramePatch",
        input: buildFramePlanInput(20_000),
    }), "frame pipeline plan").afterDiffPlan.kind),
];

console.log(JSON.stringify({
    ok: true,
    bridge: "native",
    iterations,
    reports,
}, null, 2));
