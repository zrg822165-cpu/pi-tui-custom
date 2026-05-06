import { LineDiffPatchEngine } from "./line-diff-patch-engine.mjs";
import { TerminalPatchWriter } from "./terminal-patch-writer.mjs";
import { FrameStateAdapter } from "./frame-state-adapter.mjs";
import { FramePlanner } from "./frame-planner.mjs";
import { FrameRuntime } from "./frame-runtime.mjs";
import { FrameInputAdapter } from "./frame-input-adapter.mjs";

export function createDefaultPatchEngine() {
    return new LineDiffPatchEngine();
}

export function createDefaultPatchWriter() {
    return new TerminalPatchWriter();
}

export function createDefaultFrameStateAdapter() {
    return new FrameStateAdapter();
}

export function createDefaultFramePlanner() {
    return new FramePlanner();
}

export function createDefaultFrameInputAdapter() {
    return new FrameInputAdapter();
}

export function createDefaultFrameRuntime() {
    return new FrameRuntime({
        patchEngine: createDefaultPatchEngine(),
        patchWriter: createDefaultPatchWriter(),
        frameStateAdapter: createDefaultFrameStateAdapter(),
        framePlanner: createDefaultFramePlanner(),
        frameInputAdapter: createDefaultFrameInputAdapter(),
    });
}
