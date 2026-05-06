import { createDefaultProcessExecutor } from "../shell-executor/factory.mjs";
import { createSidecarShellExecutor } from "../shell-executor/sidecar-shell-executor.mjs";

const command = process.env.PI_SHELL_EXECUTOR_COMMAND;
if (!command) {
    throw new Error("Set PI_SHELL_EXECUTOR_COMMAND to the Rust sidecar executable.");
}

const executor = createSidecarShellExecutor({ command });
const lazyExecutor = createDefaultProcessExecutor();

async function collect(iterable) {
    const events = [];
    for await (const event of iterable) {
        events.push(event);
    }
    return events;
}

const shellEvents = await collect(executor.run("echo rust-sidecar", {
    id: "shell-smoke",
    mode: "shell",
    timeout: 5000,
}));
const shellOutput = Buffer.concat(shellEvents.filter((event) => event.type === "stdout").map((event) => event.chunk)).toString("utf8");
const shellExit = shellEvents.find((event) => event.type === "exit");

const processEvents = await collect(executor.run(process.execPath, {
    id: "process-smoke",
    mode: "process",
    args: ["-e", "process.stdout.write('process-sidecar')"],
    timeout: 5000,
}));
const processOutput = Buffer.concat(processEvents.filter((event) => event.type === "stdout").map((event) => event.chunk)).toString("utf8");
const processExit = processEvents.find((event) => event.type === "exit");

executor.dispose();
lazyExecutor.dispose();

const result = {
    shellOutput: shellOutput.trim(),
    shellExitCode: shellExit?.exitCode,
    processOutput,
    processExitCode: processExit?.exitCode,
};

console.log(JSON.stringify(result, null, 2));

if (result.shellOutput !== "rust-sidecar" ||
    result.shellExitCode !== 0 ||
    result.processOutput !== "process-sidecar" ||
    result.processExitCode !== 0) {
    process.exitCode = 1;
}
