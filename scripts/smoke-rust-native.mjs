import { loadNativeCore, runNativeCoreBatch, runNativeCoreValue } from "../rust-core-shadow/native-loader.mjs";

const native = loadNativeCore();
if (!native) {
    throw new Error("Native core is not available. Build pi-core-native first.");
}

const version = native.version();
const single = runNativeCoreValue({
    core: "search",
    op: "buildRipgrepArgs",
    input: {
        pattern: "needle",
        searchPath: "src",
        glob: "*.mjs",
        ignoreCase: true,
        literal: true,
    },
});
const batch = runNativeCoreBatch([
    {
        core: "search",
        op: "buildFdArgs",
        input: {
            pattern: "src/main.rs",
            searchPath: ".",
            limit: 25,
        },
    },
    {
        core: "ui",
        op: "startupExpansion",
        input: {
            verbose: true,
            toolOutputExpanded: false,
        },
    },
    {
        core: "patch",
        op: "planAfterDiff",
        input: {
            firstChanged: 2,
            newLineCount: 10,
            previousLineCount: 9,
            previousViewportTop: 0,
            height: 5,
        },
    },
]);

if (!single.ok) {
    throw new Error(`native single failed: ${JSON.stringify(single)}`);
}
if (!batch.ok) {
    throw new Error(`native batch failed: ${JSON.stringify(batch)}`);
}

console.log(JSON.stringify({
    ok: true,
    version,
    single: single.value,
    batch: batch.values,
}, null, 2));
