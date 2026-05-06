import { SearchQueryBuilder } from "../search-indexer/search-query-builder.mjs";
import { SearchContextFormatter } from "../search-indexer/search-context-formatter.mjs";
import { SearchResultFormatter } from "../search-indexer/search-result-formatter.mjs";
import { formatSize, truncateHead, truncateLine } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/tools/truncate.js";

const command = process.env.PI_SEARCH_CORE_COMMAND;
if (!command) {
    throw new Error("Set PI_SEARCH_CORE_COMMAND to the Rust search core executable.");
}

process.env.PI_RUST_SHADOW = "1";
process.env.PI_RUST_SHADOW_STRICT = "1";

const builder = new SearchQueryBuilder();
const formatter = new SearchResultFormatter({
    truncateHead,
    formatSize,
    defaultMaxBytes: 50 * 1024,
    grepMaxLineLength: 500,
});
const contextFormatter = new SearchContextFormatter({
    fsAdapter: {
        async readFileLines(filePath) {
            return files.get(filePath) ?? [];
        },
    },
    pathAdapter: {
        formatMatchPath(_searchPath, filePath) {
            return filePath;
        },
    },
    truncateLine,
});
const files = new Map([
    ["src/main.rs", ["one", "two", "three"]],
]);

const rgArgs = builder.buildRipgrepArgs({
    pattern: "needle",
    searchPath: "src",
    glob: "*.mjs",
    ignoreCase: true,
    literal: true,
});
const fdArgs = builder.buildFdArgs({
    pattern: "src/main.rs",
    searchPath: ".",
    limit: 25,
});
const textSearch = formatter.formatTextSearch(["src/main.rs:2: two"], {
    effectiveLimit: 1,
    matchLimitReached: true,
    linesTruncated: false,
});
const findResults = formatter.formatFindResults(["src/main.rs", "src/lib.rs"], 2, true);
const directoryResults = formatter.formatDirectoryResults(["src/main.rs", "src/lib.rs"], 2, true);
const singleLine = contextFormatter.formatSingleLine({
    searchPath: ".",
    filePath: "src/main.rs",
    lineNumber: 2,
    lineText: "two\r\n",
    isDirectory: true,
});
const block = await contextFormatter.formatBlock({
    searchPath: ".",
    filePath: "src/main.rs",
    lineNumber: 2,
    contextValue: 1,
    isDirectory: true,
});

console.log(JSON.stringify({
    ok: true,
    rgArgs,
    fdArgs,
    textSearch,
    findResults,
    directoryResults,
    singleLine,
    block,
}, null, 2));
