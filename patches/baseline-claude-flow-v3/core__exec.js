/**
 * Shared command execution utilities for extensions and custom tools.
 */
import { createDefaultProcessExecutor } from "../../../../../shell-executor/index.mjs";
const processExecutor = createDefaultProcessExecutor();
/**
 * Execute a shell command and return stdout/stderr/code.
 * Supports timeout and abort signal.
 */
export async function execCommand(command, args, cwd, options) {
    let stdout = "";
    let stderr = "";
    let code = 0;
    let killed = false;
    for await (const event of processExecutor.run(command, {
        args,
            cwd,
        signal: options?.signal,
        timeout: options?.timeout,
    })) {
        if (event.type === "stdout") {
            stdout += event.chunk.toString();
        }
        else if (event.type === "stderr") {
            stderr += event.chunk.toString();
        }
        else if (event.type === "exit") {
            code = event.exitCode ?? 0;
            killed = event.killed ?? event.aborted ?? event.timedOut ?? false;
        }
        else if (event.type === "error") {
            code = 1;
        }
    }
    return { stdout, stderr, code, killed };
}
//# sourceMappingURL=exec.js.map
