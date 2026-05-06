import { runPatchCoreValue } from "./rust-patch-core.mjs";

export class FramePlanner {
    planBeforeDiff(input) {
        const rust = runPatchCoreValue("planBeforeDiff", input);
        if (rust.ok) {
            return rust.value;
        }
        const {
            previousLineCount,
            widthChanged,
            heightChanged,
            isTermux,
            clearOnShrink,
            newLineCount,
            maxLinesRendered,
            hasOverlays,
        } = input;
        if (previousLineCount === 0 && !widthChanged && !heightChanged) {
            return { kind: "fullRender", clear: false, reason: "first render", timingKind: "fullRender" };
        }
        if (widthChanged) {
            return { kind: "fullRender", clear: true, reason: "terminal width changed", timingKind: "fullRenderClear" };
        }
        if (heightChanged && !isTermux) {
            return { kind: "fullRender", clear: true, reason: "terminal height changed", timingKind: "fullRenderClear" };
        }
        if (clearOnShrink && newLineCount < maxLinesRendered && !hasOverlays) {
            return { kind: "fullRender", clear: true, reason: "clearOnShrink", timingKind: "fullRenderClear" };
        }
        return { kind: "diff" };
    }

    planAfterDiff(input) {
        const rust = runPatchCoreValue("planAfterDiff", input);
        if (rust.ok) {
            return rust.value;
        }
        const {
            firstChanged,
            newLineCount,
            previousLineCount,
            previousViewportTop,
            height,
        } = input;
        if (firstChanged === -1) {
            return { kind: "noChange", timingKind: "noChange" };
        }
        if (firstChanged >= newLineCount) {
            return { kind: "deleteLines", timingKind: "deleteLines" };
        }
        if (firstChanged < previousViewportTop) {
            return {
                kind: "viewportPatch",
                newViewportTop: Math.max(0, newLineCount - height),
                reason: "viewport-local",
            };
        }
        return {
            kind: "diffRender",
            previousLineCount,
            timingKind: "diffRender",
        };
    }
}
