import { runPatchCoreValue } from "./rust-patch-core.mjs";

export class FrameInputAdapter {
    prepare(input) {
        const rust = runPatchCoreValue("prepareFrameInput", input);
        if (rust.ok) {
            return rust.value;
        }
        const {
            terminalWidth,
            terminalHeight,
            previousWidth,
            previousHeight,
            previousViewportTop,
            hardwareCursorRow,
        } = input;
        const widthChanged = previousWidth !== 0 && previousWidth !== terminalWidth;
        const heightChanged = previousHeight !== 0 && previousHeight !== terminalHeight;
        const previousBufferLength = previousHeight > 0 ? previousViewportTop + previousHeight : terminalHeight;
        const prevViewportTop = heightChanged ? Math.max(0, previousBufferLength - terminalHeight) : previousViewportTop;
        const viewportTop = prevViewportTop;
        return {
            width: terminalWidth,
            height: terminalHeight,
            widthChanged,
            heightChanged,
            previousBufferLength,
            prevViewportTop,
            viewportTop,
            hardwareCursorRow,
        };
    }

    computeLineDiff(input) {
        const rust = runPatchCoreValue("computeLineDiff", input);
        if (rust.ok) {
            return rust.value;
        }
        const {
            targetRow,
            hardwareCursorRow,
            prevViewportTop,
            viewportTop,
        } = input;
        const currentScreenRow = hardwareCursorRow - prevViewportTop;
        const targetScreenRow = targetRow - viewportTop;
        return targetScreenRow - currentScreenRow;
    }
}
