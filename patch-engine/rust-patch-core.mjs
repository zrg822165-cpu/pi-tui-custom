import { runRustCoreValue } from "../rust-core-shadow/runner.mjs";

export function runPatchCoreValue(op, input) {
    return runRustCoreValue({
        commandEnv: "PI_PATCH_ENGINE_COMMAND",
        op,
        input,
    });
}
