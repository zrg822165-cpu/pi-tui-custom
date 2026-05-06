import { spawnSync } from "node:child_process";

const exe = process.env.PI_QUEUE_CORE_COMMAND;
if (!exe) {
    throw new Error("Set PI_QUEUE_CORE_COMMAND to the Rust queue core executable.");
}

function rust(op, input) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust queue core failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout).value;
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

function assertEqual(name, actual, expected) {
    const actualJson = JSON.stringify(stable(actual));
    const expectedJson = JSON.stringify(stable(expected));
    if (actualJson !== expectedJson) {
        throw new Error(`${name} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
    }
}

function mergeQueues(input) {
    return {
        steering: [
            ...(input.sessionSteering ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "steer").map((msg) => msg.text),
        ],
        followUp: [
            ...(input.sessionFollowUp ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
        ],
    };
}

function clearQueues(input) {
    return {
        steering: [
            ...(input.clearedSteering ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "steer").map((msg) => msg.text),
        ],
        followUp: [
            ...(input.clearedFollowUp ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
        ],
    };
}

function buildRestoreText(input) {
    const allQueued = [...(input.steering ?? []), ...(input.followUp ?? [])];
    if (allQueued.length === 0) {
        return { restoredCount: 0, text: input.currentText ?? "" };
    }
    const queuedText = allQueued.join("\n\n");
    const text = [queuedText, input.currentText ?? ""].filter((value) => value.trim()).join("\n\n");
    return { restoredCount: allQueued.length, text };
}

function planCompactionFlush(input) {
    const queuedMessages = input.queuedMessages ?? [];
    const extensionCommandFlags = input.extensionCommandFlags ?? [];
    const isExtension = (index) => !!extensionCommandFlags[index];
    const actionFor = (message, index) => {
        if (isExtension(index)) return "prompt";
        if (message.mode === "followUp") return "followUp";
        return "steer";
    };
    if (input.willRetry) {
        return {
            steps: queuedMessages.map((message, index) => ({
                action: actionFor(message, index),
                text: message.text,
                awaitBeforeContinue: true,
            })),
        };
    }
    const firstPromptIndex = queuedMessages.findIndex((_message, index) => !isExtension(index));
    if (firstPromptIndex === -1) {
        return {
            steps: queuedMessages.map((message) => ({
                action: "prompt",
                text: message.text,
                awaitBeforeContinue: true,
            })),
        };
    }
    return {
        steps: queuedMessages.map((message, index) => ({
            action: index <= firstPromptIndex ? "prompt" : actionFor(message, index),
            text: message.text,
            awaitBeforeContinue: index !== firstPromptIndex,
        })),
    };
}

const cases = [
    ["mergeQueues", {
        sessionSteering: ["s1"],
        sessionFollowUp: ["f1"],
        compactionMessages: [
            { text: "s2", mode: "steer" },
            { text: "f2", mode: "followUp" },
        ],
    }, mergeQueues],
    ["clearQueues", {
        clearedSteering: ["s1"],
        clearedFollowUp: ["f1"],
        compactionMessages: [
            { text: "s2", mode: "steer" },
            { text: "f2", mode: "followUp" },
        ],
    }, clearQueues],
    ["buildRestoreText", {
        steering: ["s"],
        followUp: ["f"],
        currentText: "current",
    }, buildRestoreText],
    ["buildRestoreText", {
        steering: [],
        followUp: [],
        currentText: "current",
    }, buildRestoreText],
    ["planCompactionFlush", {
        queuedMessages: [
            { text: "/cmd", mode: "steer" },
            { text: "ask", mode: "followUp" },
            { text: "next", mode: "followUp" },
        ],
        willRetry: false,
        extensionCommandFlags: [true, false, false],
    }, planCompactionFlush],
    ["planCompactionFlush", {
        queuedMessages: [
            { text: "/one", mode: "steer" },
            { text: "/two", mode: "followUp" },
        ],
        willRetry: false,
        extensionCommandFlags: [true, true],
    }, planCompactionFlush],
    ["planCompactionFlush", {
        queuedMessages: [
            { text: "retry steer", mode: "steer" },
            { text: "retry follow", mode: "followUp" },
        ],
        willRetry: true,
        extensionCommandFlags: [false, false],
    }, planCompactionFlush],
];

for (const [name, input, expectedFn] of cases) {
    assertEqual(name, rust(name, input), expectedFn(input));
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
