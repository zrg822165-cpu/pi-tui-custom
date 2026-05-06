import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

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

function defaultResolveShell(shellPath) {
    if (shellPath) {
        return { shell: shellPath, args: [] };
    }
    if (process.platform === "win32") {
        return { shell: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c"] };
    }
    return { shell: process.env.SHELL || "sh", args: ["-c"] };
}

function defaultKillProcessTree(pid) {
    try {
        process.kill(pid);
    }
    catch {
        // The process may already be gone.
    }
}

export function createNodeShellExecutor(options = {}) {
    const running = new Map();
    const resolveShell = options.resolveShell ?? defaultResolveShell;
    const getEnv = options.getEnv ?? (() => process.env);
    const killProcessTree = options.killProcessTree ?? defaultKillProcessTree;
    const trackPid = options.trackPid ?? (() => {});
    const untrackPid = options.untrackPid ?? (() => {});
    return {
        run(command, runOptions = {}) {
            const id = runOptions.id ?? randomUUID();
            const queue = createAsyncQueue();
            queue.push({ type: "start", id, command, cwd: runOptions.cwd });
            if (runOptions.cwd && !existsSync(runOptions.cwd)) {
                queue.push({ type: "error", id, error: new Error(`Working directory does not exist: ${runOptions.cwd}`) });
                queue.close();
                return queue;
            }
            const { shell, args } = resolveShell(runOptions.shellPath);
            const child = spawn(shell, [...args, command], {
                cwd: runOptions.cwd,
                detached: process.platform !== "win32",
                env: runOptions.env ?? getEnv(),
                stdio: ["ignore", "pipe", "pipe"],
            });
            if (child.pid) {
                trackPid(child.pid);
            }
            let timedOut = false;
            let timeoutHandle;
            const abort = () => {
                if (child.pid) {
                    killProcessTree(child.pid);
                }
            };
            running.set(id, abort);
            if (runOptions.timeout !== undefined && runOptions.timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    abort();
                }, runOptions.timeout * 1000);
            }
            const signal = runOptions.signal;
            const onAbort = () => abort();
            if (signal) {
                if (signal.aborted) {
                    onAbort();
                }
                else {
                    signal.addEventListener("abort", onAbort, { once: true });
                }
            }
            child.stdout?.on("data", (chunk) => queue.push({ type: "stdout", id, chunk }));
            child.stderr?.on("data", (chunk) => queue.push({ type: "stderr", id, chunk }));
            child.on("error", (error) => {
                queue.push({ type: "error", id, error });
            });
            child.on("close", (exitCode) => {
                if (child.pid) {
                    untrackPid(child.pid);
                }
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                if (signal) {
                    signal.removeEventListener("abort", onAbort);
                }
                running.delete(id);
                queue.push({
                    type: "exit",
                    id,
                    exitCode,
                    timedOut,
                    aborted: signal?.aborted ?? false,
                });
                queue.close();
            });
            return queue;
        },
        abort(id) {
            running.get(id)?.();
        },
    };
}

export function createProcessExecutor(options = {}) {
    const running = new Map();
    const trackPid = options.trackPid ?? (() => {});
    const untrackPid = options.untrackPid ?? (() => {});
    return {
        run(command, runOptions = {}) {
            const id = runOptions.id ?? randomUUID();
            const args = Array.isArray(runOptions.args) ? runOptions.args : [];
            const queue = createAsyncQueue();
            queue.push({ type: "start", id, command: [command, ...args].join(" "), cwd: runOptions.cwd });
            if (runOptions.cwd && !existsSync(runOptions.cwd)) {
                queue.push({ type: "error", id, error: new Error(`Working directory does not exist: ${runOptions.cwd}`) });
                queue.close();
                return queue;
            }
            const child = spawn(command, args, {
                cwd: runOptions.cwd,
                shell: false,
                env: runOptions.env ?? process.env,
                stdio: ["ignore", "pipe", "pipe"],
            });
            if (child.pid) {
                trackPid(child.pid);
            }
            let timedOut = false;
            let timeoutHandle;
            let killed = false;
            const abort = () => {
                if (killed) {
                    return;
                }
                killed = true;
                child.kill("SIGTERM");
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill("SIGKILL");
                    }
                }, 5000);
            };
            running.set(id, abort);
            if (runOptions.timeout !== undefined && runOptions.timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    abort();
                }, runOptions.timeout);
            }
            const signal = runOptions.signal;
            const onAbort = () => abort();
            if (signal) {
                if (signal.aborted) {
                    onAbort();
                }
                else {
                    signal.addEventListener("abort", onAbort, { once: true });
                }
            }
            child.stdout?.on("data", (chunk) => queue.push({ type: "stdout", id, chunk }));
            child.stderr?.on("data", (chunk) => queue.push({ type: "stderr", id, chunk }));
            child.on("error", (error) => {
                queue.push({ type: "error", id, error });
            });
            child.on("close", (exitCode) => {
                if (child.pid) {
                    untrackPid(child.pid);
                }
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                if (signal) {
                    signal.removeEventListener("abort", onAbort);
                }
                running.delete(id);
                queue.push({
                    type: "exit",
                    id,
                    exitCode,
                    timedOut,
                    aborted: signal?.aborted ?? false,
                    killed,
                });
                queue.close();
            });
            return queue;
        },
        abort(id) {
            running.get(id)?.();
        },
    };
}
