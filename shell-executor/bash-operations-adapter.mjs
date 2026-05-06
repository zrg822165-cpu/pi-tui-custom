export function createBashOperationsFromShellExecutor(executor) {
    return {
        exec: async (command, cwd, { onData, signal, timeout, env } = {}) => {
            let exitCode = 0;
            for await (const event of executor.run(command, { cwd, signal, timeout, env })) {
                if (event.type === "stdout" || event.type === "stderr") {
                    onData?.(event.chunk);
                }
                else if (event.type === "error") {
                    throw event.error;
                }
                else if (event.type === "exit") {
                    if (event.aborted) {
                        throw new Error("aborted");
                    }
                    if (event.timedOut) {
                        throw new Error(`timeout:${timeout}`);
                    }
                    exitCode = event.exitCode;
                }
            }
            return { exitCode };
        },
    };
}

