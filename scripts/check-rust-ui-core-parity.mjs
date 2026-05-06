import { spawnSync } from "node:child_process";

const exe = process.env.PI_UI_CORE_COMMAND;
if (!exe) {
    throw new Error("Set PI_UI_CORE_COMMAND to the Rust UI core executable.");
}

function rust(op, input) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust UI core failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout).value;
}

function assertEqual(name, actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${name} mismatch\nactual:   ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`);
    }
}

function toolShouldAttach(input) {
    if (input.alreadyAttached) return false;
    if (input.force || input.expanded || input.executionStarted || input.argsComplete || input.hasResult) return true;
    return input.displayTarget !== "";
}

function startupExpansion(input) {
    return input.verbose || input.toolOutputExpanded;
}

function shouldShowThinkingStatus(input) {
    return input.thinkingLevel !== "off" && !!input.modelHasReasoning;
}

function workingLoaderMessage(input) {
    return input.workingMessage ?? input.defaultWorkingMessage;
}

function noticeText(input) {
    switch (input.kind) {
        case "sessionName": return `Session name: ${input.value ?? ""}`;
        case "sessionNameSet": return `Session name set: ${input.value ?? ""}`;
        case "newSessionStarted": return "✓ New session started";
        case "debugLogWritten": return `✓ Debug log written\n${input.value ?? ""}`;
        default: throw new Error(`unknown kind ${input.kind}`);
    }
}

const cases = [
    ["toolShouldAttach", { alreadyAttached: true, force: true, displayTarget: "x" }, toolShouldAttach],
    ["toolShouldAttach", { alreadyAttached: false, force: false, expanded: false, executionStarted: false, argsComplete: false, hasResult: false, displayTarget: "" }, toolShouldAttach],
    ["toolShouldAttach", { alreadyAttached: false, force: false, expanded: false, executionStarted: false, argsComplete: false, hasResult: false, displayTarget: "bash" }, toolShouldAttach],
    ["startupExpansion", { verbose: true, toolOutputExpanded: false }, startupExpansion],
    ["startupExpansion", { verbose: false, toolOutputExpanded: false }, startupExpansion],
    ["shouldShowThinkingStatus", { thinkingLevel: "off", modelHasReasoning: true }, shouldShowThinkingStatus],
    ["shouldShowThinkingStatus", { thinkingLevel: "high", modelHasReasoning: true }, shouldShowThinkingStatus],
    ["workingLoaderMessage", { workingMessage: "Working", defaultWorkingMessage: "Default" }, workingLoaderMessage],
    ["workingLoaderMessage", { defaultWorkingMessage: "Default" }, workingLoaderMessage],
    ["noticeText", { kind: "sessionName", value: "abc" }, noticeText],
    ["noticeText", { kind: "sessionNameSet", value: "abc" }, noticeText],
    ["noticeText", { kind: "newSessionStarted" }, noticeText],
    ["noticeText", { kind: "debugLogWritten", value: "C:/tmp/log.txt" }, noticeText],
];

for (const [name, input, expectedFn] of cases) {
    assertEqual(name, rust(name, input), expectedFn(input));
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
