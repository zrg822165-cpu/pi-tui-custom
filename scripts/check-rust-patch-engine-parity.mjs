import { spawnSync } from "node:child_process";
import { FrameInputAdapter } from "../patch-engine/frame-input-adapter.mjs";
import { FramePlanner } from "../patch-engine/frame-planner.mjs";
import { LineDiffPatchEngine } from "../patch-engine/line-diff-patch-engine.mjs";

const exe = process.env.PI_PATCH_ENGINE_COMMAND;
if (!exe) {
    throw new Error("Set PI_PATCH_ENGINE_COMMAND to the Rust patch engine executable.");
}

const engine = new LineDiffPatchEngine();
const frameInput = new FrameInputAdapter();
const planner = new FramePlanner();

function rust(op, input) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust patch engine failed: ${result.stderr}`);
    }
    const message = JSON.parse(result.stdout);
    return message.value;
}

function assertEqual(name, actual, expected) {
    const actualJson = JSON.stringify(stable(actual));
    const expectedJson = JSON.stringify(stable(expected));
    if (actualJson !== expectedJson) {
        throw new Error(`${name} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
    }
}

function computeJsExpected(fn) {
    const previous = process.env.PI_RUST_CORE;
    process.env.PI_RUST_CORE = "0";
    try {
        return fn();
    }
    finally {
        if (previous === undefined) {
            delete process.env.PI_RUST_CORE;
        }
        else {
            process.env.PI_RUST_CORE = previous;
        }
    }
}

function stable(value) {
    if (Array.isArray(value)) {
        return value.map(stable);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
}

const cases = [
    ["findChangedRange", {
        previousLines: ["a", "b"],
        newLines: ["a", "b", "c"],
        height: 20,
        previousViewportTop: 0,
    }],
    ["findChangedRange", {
        previousLines: Array.from({ length: 400 }, (_, index) => `line ${index}`),
        newLines: Array.from({ length: 400 }, (_, index) => index === 10 ? "changed" : `line ${index}`),
        height: 20,
        previousViewportTop: 0,
    }],
    ["findViewportChangedRange", {
        previousLines: ["a", "b", "c", "d"],
        newLines: ["a", "x", "c", "y"],
        oldViewportTop: 0,
        newViewportTop: 0,
        height: 4,
    }],
    ["buildMarkedLinePatch", {
        targetRow: 3,
        originalRow: 1,
        originalCol: 4,
        nextLine: "status",
    }],
    ["buildFullRenderPatch", {
        clear: true,
        newLines: ["one", "two"],
    }],
    ["buildViewportPatch", {
        firstScreenChanged: 1,
        lastScreenChanged: 2,
        currentScreenRow: 0,
        newViewportTop: 0,
        newLines: ["a", "b2", "c2"],
    }],
    ["buildDeleteLinesPatch", {
        lineDiff: -1,
        extraLines: 3,
    }],
    ["buildDiffRenderPatch", {
        firstChanged: 2,
        renderEnd: 4,
        appendStart: false,
        prevViewportTop: 0,
        viewportTop: 0,
        hardwareCursorRow: 1,
        height: 5,
        newLines: ["a", "b", "c2", "d2", "e2"],
        previousLineCount: 5,
    }],
    ["buildHardwareCursorPatch", {
        currentRow: 5,
        targetRow: 2,
        targetCol: 8,
    }],
    ["prepareFrameInput", {
        terminalWidth: 100,
        terminalHeight: 20,
        previousWidth: 100,
        previousHeight: 30,
        previousViewportTop: 10,
        hardwareCursorRow: 25,
    }, frameInput.prepare.bind(frameInput)],
    ["computeLineDiff", {
        targetRow: 12,
        hardwareCursorRow: 9,
        prevViewportTop: 5,
        viewportTop: 8,
    }, frameInput.computeLineDiff.bind(frameInput)],
    ["planBeforeDiff", {
        previousLineCount: 5,
        widthChanged: true,
        heightChanged: false,
        isTermux: false,
        clearOnShrink: false,
        newLineCount: 5,
        maxLinesRendered: 5,
        hasOverlays: false,
    }, planner.planBeforeDiff.bind(planner)],
    ["planBeforeDiff", {
        previousLineCount: 5,
        widthChanged: false,
        heightChanged: false,
        isTermux: false,
        clearOnShrink: false,
        newLineCount: 5,
        maxLinesRendered: 5,
        hasOverlays: false,
    }, planner.planBeforeDiff.bind(planner)],
    ["planAfterDiff", {
        firstChanged: -1,
        newLineCount: 5,
        previousLineCount: 5,
        previousViewportTop: 0,
        height: 20,
    }, planner.planAfterDiff.bind(planner)],
    ["planAfterDiff", {
        firstChanged: 2,
        newLineCount: 50,
        previousLineCount: 50,
        previousViewportTop: 10,
        height: 20,
    }, planner.planAfterDiff.bind(planner)],
    ["planFramePatch", {
        terminalWidth: 100,
        terminalHeight: 20,
        previousWidth: 100,
        previousHeight: 20,
        previousViewportTop: 0,
        hardwareCursorRow: 4,
        previousLines: ["a", "b", "c"],
        newLines: ["a", "b2", "c"],
        isTermux: false,
        clearOnShrink: false,
        maxLinesRendered: 3,
        hasOverlays: false,
    }, (input) => {
        const preparedFrameInput = frameInput.prepare(input);
        const beforeDiffPlan = planner.planBeforeDiff({
            previousLineCount: input.previousLines.length,
            widthChanged: preparedFrameInput.widthChanged,
            heightChanged: preparedFrameInput.heightChanged,
            isTermux: input.isTermux,
            clearOnShrink: input.clearOnShrink,
            newLineCount: input.newLines.length,
            maxLinesRendered: input.maxLinesRendered,
            hasOverlays: input.hasOverlays,
        });
        const changedRange = engine.findChangedRange({
            previousLines: input.previousLines,
            newLines: input.newLines,
            height: preparedFrameInput.height,
            previousViewportTop: preparedFrameInput.prevViewportTop,
        });
        const afterDiffPlan = planner.planAfterDiff({
            firstChanged: changedRange.firstChanged,
            newLineCount: input.newLines.length,
            previousLineCount: input.previousLines.length,
            previousViewportTop: preparedFrameInput.prevViewportTop,
            height: preparedFrameInput.height,
        });
        return { frameInput: preparedFrameInput, beforeDiffPlan, changedRange, afterDiffPlan };
    }],
];

for (const [name, input, fn] of cases) {
    const expected = computeJsExpected(() => fn ? fn(input) : engine[name](input));
    const actual = rust(name, input);
    assertEqual(name, actual, expected);
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
