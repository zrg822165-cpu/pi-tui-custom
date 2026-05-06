import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeCoreValue } from "./native-loader.mjs";

const DEFAULT_TIMEOUT_MS = 2000;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COMMAND_ENV_TO_EXE = {
    PI_EVENT_CORE_COMMAND: "pi-event-core.exe",
    PI_PATCH_ENGINE_COMMAND: "pi-patch-engine.exe",
    PI_QUEUE_CORE_COMMAND: "pi-queue-core.exe",
    PI_SEARCH_CORE_COMMAND: "pi-search-core.exe",
    PI_TRANSCRIPT_CORE_COMMAND: "pi-transcript-core.exe",
    PI_UI_CORE_COMMAND: "pi-ui-core.exe",
};

const COMMAND_ENV_TO_CORE = {
    PI_EVENT_CORE_COMMAND: "event",
    PI_PATCH_ENGINE_COMMAND: "patch",
    PI_QUEUE_CORE_COMMAND: "queue",
    PI_SEARCH_CORE_COMMAND: "search",
    PI_TRANSCRIPT_CORE_COMMAND: "transcript",
    PI_UI_CORE_COMMAND: "ui",
};

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
    const command = resolveCommand(commandEnv);
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

export function runRustCoreValue({ commandEnv, op, input, timeoutMs }) {
    if (process.env.PI_RUST_CORE === "0") {
        return { ok: false, skipped: "disabled" };
    }
    if (process.env.PI_RUST_BRIDGE !== "cli" && process.env.PI_RUST_BRIDGE !== "js") {
        const core = COMMAND_ENV_TO_CORE[commandEnv];
        if (core) {
            const native = runNativeCoreValue({ core, op, input });
            if (native.ok || process.env.PI_RUST_BRIDGE === "native") {
                return native;
            }
        }
    }
    if (process.env.PI_RUST_BRIDGE === "native" || process.env.PI_RUST_BRIDGE !== "cli") {
        return { ok: false, skipped: "native_unavailable" };
    }
    const command = resolveCommand(commandEnv);
    if (!command) {
        return { ok: false, skipped: "missing_command" };
    }
    const timeout = timeoutMs ?? (Number.parseInt(process.env.PI_RUST_CORE_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS);
    const result = spawnSync(command, {
        input: JSON.stringify({ op, input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
    });
    if (result.status !== 0) {
        return {
            ok: false,
            error: {
                reason: "rust_command_failed",
                status: result.status,
                stderr: result.stderr.trim(),
            },
        };
    }
    try {
        return { ok: true, value: JSON.parse(result.stdout).value };
    }
    catch (error) {
        return {
            ok: false,
            error: {
                reason: "rust_output_parse_failed",
                message: error instanceof Error ? error.message : String(error),
                stdout: result.stdout,
            },
        };
    }
}

function resolveCommand(commandEnv) {
    const explicit = process.env[commandEnv];
    if (explicit) {
        return explicit;
    }
    const exe = COMMAND_ENV_TO_EXE[commandEnv];
    if (!exe) {
        return undefined;
    }
    const candidate = path.join(repoRoot, "target", "release", exe);
    return existsSync(candidate) ? candidate : undefined;
}

function reportShadowMismatch(name, data) {
    const payload = JSON.stringify({ name, ...data });
    if (process.env.PI_RUST_SHADOW_STRICT === "1") {
        throw new Error(`Rust shadow mismatch: ${payload}`);
    }
    process.stderr.write(`[rust-shadow] ${payload}\n`);
}
