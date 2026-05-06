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
        op: "planFramePatch",
        input: {
            terminalWidth: 80,
            terminalHeight: 24,
            previousWidth: 80,
            previousHeight: 24,
            previousViewportTop: 0,
            hardwareCursorRow: 2,
            previousLines: ["one", "two"],
            newLines: ["one", "two changed"],
            isTermux: false,
            clearOnShrink: false,
            maxLinesRendered: 2,
            hasOverlays: false,
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
