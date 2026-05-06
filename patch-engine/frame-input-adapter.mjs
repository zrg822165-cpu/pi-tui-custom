export class FrameInputAdapter {
    prepare(input) {
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
