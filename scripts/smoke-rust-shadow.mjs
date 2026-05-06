import { SearchQueryBuilder } from "../search-indexer/search-query-builder.mjs";

const command = process.env.PI_SEARCH_CORE_COMMAND;
if (!command) {
    throw new Error("Set PI_SEARCH_CORE_COMMAND to the Rust search core executable.");
}

process.env.PI_RUST_SHADOW = "1";
process.env.PI_RUST_SHADOW_STRICT = "1";

const builder = new SearchQueryBuilder();
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

console.log(JSON.stringify({
    ok: true,
    rgArgs,
    fdArgs,
}, null, 2));
