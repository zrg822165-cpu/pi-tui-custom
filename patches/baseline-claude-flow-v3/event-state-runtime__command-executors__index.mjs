import { executeCompactionCommand } from "./compaction-command-executor.mjs";
import { executeCoreCommand } from "./core-command-executor.mjs";
import { executeRetryCommand } from "./retry-command-executor.mjs";
import { executeToolCommand } from "./tool-command-executor.mjs";
import { executeTranscriptCommand } from "./transcript-command-executor.mjs";

const COMMAND_EXECUTORS = Object.freeze([
    executeCoreCommand,
    executeRetryCommand,
    executeToolCommand,
    executeTranscriptCommand,
    executeCompactionCommand,
]);

export async function executeKnownCommand(host, command) {
    for (const executor of COMMAND_EXECUTORS) {
        if (await executor(host, command)) {
            return true;
        }
    }
    return false;
}

export const COMMAND_EXECUTOR_DOMAINS = Object.freeze([
    "core",
    "retry",
    "tool",
    "transcript",
    "compaction",
]);
