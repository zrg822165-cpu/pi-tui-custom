import { spawnSync } from "node:child_process";
import { SearchQueryBuilder } from "../search-indexer/search-query-builder.mjs";
import { formatSize, truncateHead, truncateLine } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/tools/truncate.js";

const exe = process.env.PI_SEARCH_CORE_COMMAND;
if (!exe) {
    throw new Error("Set PI_SEARCH_CORE_COMMAND to the Rust search core executable.");
}

const queryBuilder = new SearchQueryBuilder();

function rust(op, input) {
    const result = spawnSync(exe, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        throw new Error(`Rust search core failed: ${result.stderr}`);
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

const cases = [
    ["buildRipgrepArgs", {
        pattern: "needle",
        searchPath: "src",
        glob: "*.mjs",
        ignoreCase: true,
        literal: true,
    }, queryBuilder.buildRipgrepArgs.bind(queryBuilder)],
    ["buildRipgrepArgs", {
        pattern: "a+b",
        searchPath: ".",
        ignoreCase: false,
        literal: false,
    }, queryBuilder.buildRipgrepArgs.bind(queryBuilder)],
    ["buildFdArgs", {
        pattern: "src/main.rs",
        searchPath: ".",
        limit: 25,
    }, queryBuilder.buildFdArgs.bind(queryBuilder)],
    ["buildFdArgs", {
        pattern: "**/README.md",
        searchPath: ".",
        limit: 10,
    }, queryBuilder.buildFdArgs.bind(queryBuilder)],
    ["truncateHead", {
        content: "abc\ndef\nghi",
        maxLines: 99,
        maxBytes: 7,
    }, ({ content, maxLines, maxBytes }) => truncateHead(content, { maxLines, maxBytes })],
    ["truncateHead", {
        content: "第一行\nsecond\nthird",
        maxLines: 2,
        maxBytes: 100,
    }, ({ content, maxLines, maxBytes }) => truncateHead(content, { maxLines, maxBytes })],
    ["truncateLine", {
        line: "abcdef",
        maxChars: 3,
    }, ({ line, maxChars }) => truncateLine(line, maxChars)],
    ["truncateLine", {
        line: "短文本",
        maxChars: 10,
    }, ({ line, maxChars }) => truncateLine(line, maxChars)],
    ["formatSize", {
        bytes: 512,
    }, ({ bytes }) => formatSize(bytes)],
    ["formatSize", {
        bytes: 1536,
    }, ({ bytes }) => formatSize(bytes)],
];

for (const [name, input, expectedFn] of cases) {
    assertEqual(name, rust(name, input), expectedFn(input));
}

console.log(JSON.stringify({ ok: true, checked: cases.length }, null, 2));
