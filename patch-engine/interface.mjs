export const PATCH_ENGINE_PROTOCOL_VERSION = 1;

export const PATCH_ENGINE_SURFACE = Object.freeze({
    diff: [
        "findChangedRange",
        "findViewportChangedRange",
    ],
    liveLine: [
        "buildMarkedLinePatch",
    ],
    buffers: [
        "buildFullRenderPatch",
        "buildViewportPatch",
        "buildDeleteLinesPatch",
        "buildDiffRenderPatch",
        "buildHardwareCursorPatch",
    ],
    safety: [
        "findFirstWideLine",
        "buildWideLineCrashReport",
        "buildWideLineErrorMessage",
        "buildDebugRenderReport",
    ],
    writer: [
        "write",
    ],
    frameState: [
        "commitFullRender",
        "commitViewportPatch",
        "commitViewportNoChange",
        "commitNoChange",
        "commitDeleteLines",
        "commitDiffRender",
        "commitHardwareCursor",
        "commitHiddenHardwareCursor",
    ],
    framePlanner: [
        "planBeforeDiff",
        "planAfterDiff",
    ],
    frameRuntime: [
        "prepareFrameInput",
        "computeLineDiff",
        "planBeforeDiff",
        "planAfterDiff",
        "write",
        "applyState",
        "formatFullRenderReason",
        "executeFullRender",
        "executeNoChange",
        "executeDeleteLines",
        "executeViewportPatch",
        "executeDiffRender",
        "positionHardwareCursor",
    ],
    frameInput: [
        "prepare",
        "computeLineDiff",
    ],
});
