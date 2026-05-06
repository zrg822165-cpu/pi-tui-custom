import { createDefaultProcessExecutor } from "./factory.mjs";

export async function runProcessLines(command, args = [], options = {}) {
    const executor = options.executor ?? createDefaultProcessExecutor();
    const stdoutLines = [];
    let stdoutBuffer = "";
    let stderr = "";
    let exitEvent;
    const flushStdoutLine = async (line) => {
        if (options.onStdoutLine) {
            await options.onStdoutLine(line);
        }
        else {
            stdoutLines.push(line);
        }
    };
    const flushStdoutBuffer = async () => {
        if (stdoutBuffer.length === 0) {
            return;
        }
        const line = stdoutBuffer;
        stdoutBuffer = "";
        await flushStdoutLine(line);
    };
    for await (const event of executor.run(command, {
        args,
        cwd: options.cwd,
        env: options.env,
        signal: options.signal,
        timeout: options.timeout,
    })) {
        if (event.type === "stdout") {
            stdoutBuffer += event.chunk.toString();
            let newlineIndex;
            while ((newlineIndex = stdoutBuffer.search(/\r?\n/)) !== -1) {
                const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
                const newlineLength = stdoutBuffer[newlineIndex] === "\r" && stdoutBuffer[newlineIndex + 1] === "\n" ? 2 : 1;
                stdoutBuffer = stdoutBuffer.slice(newlineIndex + newlineLength);
                await flushStdoutLine(line);
            }
        }
        else if (event.type === "stderr") {
            stderr += event.chunk.toString();
        }
        else if (event.type === "error") {
            throw event.error;
        }
        else if (event.type === "exit") {
            exitEvent = event;
        }
    }
    await flushStdoutBuffer();
    return {
        exitCode: exitEvent?.exitCode,
        timedOut: exitEvent?.timedOut ?? false,
        aborted: exitEvent?.aborted ?? false,
        killed: exitEvent?.killed ?? false,
        stderr,
        stdoutLines,
    };
}
