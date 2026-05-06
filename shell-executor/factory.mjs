import { createNodeShellExecutor, createProcessExecutor } from "./js-shell-executor.mjs";
import { createSidecarShellExecutor } from "./sidecar-shell-executor.mjs";

function shouldUseSidecar() {
    return !!process.env.PI_SHELL_EXECUTOR_COMMAND;
}

function createLazySidecarShellExecutor(options = {}, defaults = {}) {
    let sidecar;
    let active = 0;
    let idleTimer;
    const idleDisposeMs = options.idleDisposeMs ?? 100;
    const ensureSidecar = () => {
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = undefined;
        }
        sidecar ??= createSidecarShellExecutor(options);
        return sidecar;
    };
    const scheduleDispose = () => {
        if (active > 0 || idleTimer) {
            return;
        }
        idleTimer = setTimeout(() => {
            idleTimer = undefined;
            sidecar?.dispose();
            sidecar = undefined;
        }, idleDisposeMs);
    };
    return {
        async *run(command, runOptions = {}) {
            active += 1;
            try {
                yield* ensureSidecar().run(command, { ...defaults, ...runOptions });
            }
            finally {
                active -= 1;
                scheduleDispose();
            }
        },
        abort(id) {
            sidecar?.abort(id);
        },
        dispose() {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = undefined;
            }
            sidecar?.dispose();
            sidecar = undefined;
        },
    };
}

export function createDefaultShellExecutor(options = {}) {
    if (shouldUseSidecar()) {
        return createLazySidecarShellExecutor(options);
    }
    return createNodeShellExecutor(options);
}

export function createDefaultProcessExecutor(options = {}) {
    if (shouldUseSidecar()) {
        return createLazySidecarShellExecutor(options, { mode: "process" });
    }
    return createProcessExecutor(options);
}
