import { InteractiveMode } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js";
import { checkEffectCommandExecutor, runEventStateRuntimeSelfTest } from "../event-state-runtime/index.mjs";

const proto = InteractiveMode.prototype;
const result = {
    interactiveImport: true,
    hasHandleEvent: typeof proto.handleEvent,
    hasShutdown: typeof proto.shutdown,
    hasBash: typeof proto.handleBashCommand,
    self: runEventStateRuntimeSelfTest().ok,
    executor: (await checkEffectCommandExecutor()).ok,
};

console.log(JSON.stringify(result, null, 2));

if (result.hasHandleEvent !== "function" ||
    result.hasShutdown !== "function" ||
    result.hasBash !== "function" ||
    !result.self ||
    !result.executor) {
    process.exitCode = 1;
}
