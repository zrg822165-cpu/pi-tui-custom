import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 2000;

function isEnabled() {
    return process.env.PI_RUST_SHADOW === "1";
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

function sameValue(a, b) {
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

export function runRustShadow({ name, commandEnv, op, input, jsValue }) {
    if (!isEnabled()) {
        return { checked: false };
    }
    const command = process.env[commandEnv];
    if (!command) {
        return { checked: false, skipped: "missing_command" };
    }
    const result = spawnSync(command, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: Number.parseInt(process.env.PI_RUST_SHADOW_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS,
    });
    if (result.status !== 0) {
        reportShadowMismatch(name, {
            reason: "rust_command_failed",
            status: result.status,
            stderr: result.stderr.trim(),
        });
        return { checked: true, ok: false };
    }
    let rustValue;
    try {
        rustValue = JSON.parse(result.stdout).value;
    }
    catch (error) {
        reportShadowMismatch(name, {
            reason: "rust_output_parse_failed",
            error: error instanceof Error ? error.message : String(error),
            stdout: result.stdout,
        });
        return { checked: true, ok: false };
    }
    if (!sameValue(rustValue, jsValue)) {
        reportShadowMismatch(name, {
            reason: "value_mismatch",
            op,
            input,
            jsValue,
            rustValue,
        });
        return { checked: true, ok: false };
    }
    return { checked: true, ok: true };
}

function reportShadowMismatch(name, data) {
    const payload = JSON.stringify({ name, ...data });
    if (process.env.PI_RUST_SHADOW_STRICT === "1") {
        throw new Error(`Rust shadow mismatch: ${payload}`);
    }
    process.stderr.write(`[rust-shadow] ${payload}\n`);
}
