import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

function createAsyncQueue() {
    const values = [];
    const waiters = [];
    let closed = false;
    return {
        push(value) {
            if (closed) {
                return;
            }
            const waiter = waiters.shift();
            if (waiter) {
                waiter({ value, done: false });
                return;
            }
            values.push(value);
        },
        close() {
            closed = true;
            while (waiters.length > 0) {
                waiters.shift()({ value: undefined, done: true });
            }
        },
        async next() {
            if (values.length > 0) {
                return { value: values.shift(), done: false };
            }
            if (closed) {
                return { value: undefined, done: true };
            }
            return new Promise((resolve) => waiters.push(resolve));
        },
        [Symbol.asyncIterator]() {
            return this;
        },
    };
}

function splitCommandLine(commandLine) {
    const parts = [];
    const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
    let match;
    while ((match = re.exec(commandLine))) {
        parts.push(match[1] ?? match[2] ?? match[0]);
    }
    return parts;
}

function decodeChunk(chunk) {
    if (typeof chunk === "string") {
        return Buffer.from(chunk, "base64");
    }
    return Buffer.alloc(0);
}

/**
 * JSONL sidecar executor protocol for future Rust executors.
 *
 * Request:
 * {"type":"run","id":"...","mode":"shell|process","command":"...","args":[],"cwd":"...","env":{},"timeout":1000}
 *
 * Response:
 * {"type":"start","id":"..."}
 * {"type":"stdout","id":"...","chunk":"base64"}
 * {"type":"stderr","id":"...","chunk":"base64"}
 * {"type":"exit","id":"...","exitCode":0,"timedOut":false,"aborted":false}
 * {"type":"error","id":"...","message":"..."}
 */
export function createSidecarShellExecutor(options = {}) {
    const commandLine = options.command ?? process.env.PI_SHELL_EXECUTOR_COMMAND;
    if (!commandLine) {
        throw new Error("Missing sidecar command. Set PI_SHELL_EXECUTOR_COMMAND or pass { command }.");
    }
    const parts = Array.isArray(commandLine) ? commandLine : splitCommandLine(commandLine);
    const command = parts[0];
    const args = parts.slice(1);
    const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: options.env ?? process.env,
    });
    const pending = new Map();
    const stderr = createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
        if (process.env.PI_SHELL_EXECUTOR_DEBUG === "1") {
            process.stderr.write(`[shell-sidecar] ${line}\n`);
        }
    });
    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return;
        }
        const queue = pending.get(message.id);
        if (!queue) {
            return;
        }
        if (message.type === "stdout" || message.type === "stderr") {
            queue.push({ type: message.type, id: message.id, chunk: decodeChunk(message.chunk) });
        }
        else if (message.type === "error") {
            queue.push({ type: "error", id: message.id, error: new Error(message.message || "Sidecar shell error") });
            queue.close();
            pending.delete(message.id);
        }
        else if (message.type === "exit") {
            queue.push({
                type: "exit",
                id: message.id,
                exitCode: message.exitCode,
                timedOut: message.timedOut,
                aborted: message.aborted,
                killed: message.killed,
            });
            queue.close();
            pending.delete(message.id);
        }
        else if (message.type === "start") {
            queue.push({ type: "start", id: message.id, command: message.command ?? "", cwd: message.cwd });
        }
    });
    child.on("exit", () => {
        for (const [id, queue] of pending) {
            queue.push({ type: "error", id, error: new Error("Shell sidecar exited") });
            queue.close();
        }
        pending.clear();
    });
    return {
        run(commandToRun, runOptions = {}) {
            const id = runOptions.id ?? randomUUID();
            const queue = createAsyncQueue();
            pending.set(id, queue);
            child.stdin.write(JSON.stringify({
                type: "run",
                id,
                mode: runOptions.mode ?? "shell",
                command: commandToRun,
                args: runOptions.args ?? [],
                cwd: runOptions.cwd,
                env: runOptions.env,
                timeout: runOptions.timeout,
            }) + "\n");
            return queue;
        },
        abort(id) {
            child.stdin.write(JSON.stringify({ type: "abort", id }) + "\n");
        },
        dispose() {
            child.kill();
        },
    };
}

