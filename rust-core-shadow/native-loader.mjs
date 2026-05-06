import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NATIVE_CANDIDATES = [
    process.env.PI_CORE_NATIVE_PATH,
    path.join(repoRoot, "target", "release", "pi_core_native.node"),
    path.join(repoRoot, "target", "release", "pi_core_native.dll"),
    path.join(repoRoot, "target", "debug", "pi_core_native.node"),
    path.join(repoRoot, "target", "debug", "pi_core_native.dll"),
].filter(Boolean);

let cached = undefined;

export function loadNativeCore() {
    if (process.env.PI_RUST_CORE === "0" || process.env.PI_RUST_BRIDGE === "cli" || process.env.PI_RUST_BRIDGE === "js") {
        return undefined;
    }
    if (cached !== undefined) {
        return cached;
    }
    for (const candidate of NATIVE_CANDIDATES) {
        if (!existsSync(candidate)) {
            continue;
        }
        try {
            cached = require(candidate);
            return cached;
        }
        catch {
            continue;
        }
    }
    cached = null;
    return undefined;
}

export function runNativeCoreValue({ core, op, input }) {
    const native = loadNativeCore();
    if (!native?.execute) {
        return { ok: false, skipped: "missing_native" };
    }
    try {
        const output = native.execute(JSON.stringify({ core, op: { op, input } }));
        return { ok: true, value: JSON.parse(output).value };
    }
    catch (error) {
        return {
            ok: false,
            error: {
                reason: "native_failed",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

export function runNativeCoreBatch(operations) {
    const native = loadNativeCore();
    if (!native?.executeBatch) {
        return { ok: false, skipped: "missing_native" };
    }
    try {
        const payload = operations.map(({ core, op, input }) => ({ core, op: { op, input } }));
        const output = native.executeBatch(JSON.stringify(payload));
        return { ok: true, values: JSON.parse(output).map((item) => item.value) };
    }
    catch (error) {
        return {
            ok: false,
            error: {
                reason: "native_batch_failed",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
