import { createNodeShellExecutor, createProcessExecutor } from "./js-shell-executor.mjs";
import { createSidecarShellExecutor } from "./sidecar-shell-executor.mjs";

function shouldUseSidecar() {
    return !!process.env.PI_SHELL_EXECUTOR_COMMAND;
}

export function createDefaultShellExecutor(options = {}) {
    if (shouldUseSidecar()) {
        return createSidecarShellExecutor(options);
    }
    return createNodeShellExecutor(options);
}

export function createDefaultProcessExecutor(options = {}) {
    if (shouldUseSidecar()) {
        const sidecar = createSidecarShellExecutor(options);
        return {
            ...sidecar,
            run(command, runOptions = {}) {
                return sidecar.run(command, { ...runOptions, mode: "process" });
            },
        };
    }
    return createProcessExecutor(options);
}

