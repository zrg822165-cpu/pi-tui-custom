import { spawnSync } from "node:child_process";
import { LineDiffPatchEngine } from "../patch-engine/line-diff-patch-engine.mjs";

const exe = process.env.PI_PATCH_ENGINE_COMMAND;
if (!exe) {
    throw new Error("Set PI_PATCH_ENGINE_COMMAND to the Rust patch engine executable.");
}

const engine = new LineDiffPatchEngine();

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
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(`${name} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
    }
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
];

for (const [name, input] of cases) {
    const expected = engine[name](input);
    const actual = rust(name, input);
    assertEqual(name, actual, expected);
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
