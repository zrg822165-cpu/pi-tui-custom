export class FrameStateAdapter {
    commitFullRender(input) {
        const { clear, newLines, height, visibleWidth } = input;
        const cursorRow = Math.max(0, newLines.length - 1);
        return {
            cursorRow,
            hardwareCursorRow: cursorRow,
            hardwareCursorCol: visibleWidth(newLines[cursorRow] ?? ""),
            maxLinesRendered: clear ? newLines.length : Math.max(input.maxLinesRendered, newLines.length),
            previousViewportTop: Math.max(0, Math.max(height, newLines.length) - height),
            previousLines: newLines,
            previousWidth: input.width,
            previousHeight: height,
            clearLiveMarkers: true,
        };
    }

    commitViewportPatch(input) {
        const { newLines, newViewportTop, lastScreenChanged, width, height, visibleWidth } = input;
        const hardwareCursorRow = newViewportTop + lastScreenChanged;
        return {
            cursorRow: Math.max(0, newLines.length - 1),
            hardwareCursorRow,
            hardwareCursorCol: visibleWidth(newLines[hardwareCursorRow] ?? ""),
            maxLinesRendered: Math.max(input.maxLinesRendered, newLines.length),
            previousViewportTop: newViewportTop,
            previousLines: newLines,
            previousWidth: width,
            previousHeight: height,
            clearLiveMarkers: true,
        };
    }

    commitViewportNoChange(input) {
        return {
            previousLines: input.newLines,
            previousWidth: input.width,
            previousHeight: input.height,
            previousViewportTop: input.newViewportTop,
            clearLiveMarkers: true,
        };
    }

    commitNoChange(input) {
        return {
            previousViewportTop: input.previousViewportTop,
            previousHeight: input.height,
        };
    }

    commitDeleteLines(input) {
        const { targetRow, newLines, width, height, previousViewportTop } = input;
        return {
            cursorRow: targetRow,
            hardwareCursorRow: targetRow,
            previousLines: newLines,
            previousWidth: width,
            previousHeight: height,
            previousViewportTop,
            clearLiveMarkers: true,
        };
    }

    commitDiffRender(input) {
        const {
            newLines,
            finalCursorRow,
            prevViewportTop,
            height,
            width,
            visibleWidth,
        } = input;
        return {
            cursorRow: Math.max(0, newLines.length - 1),
            hardwareCursorRow: finalCursorRow,
            hardwareCursorCol: visibleWidth(newLines[finalCursorRow] ?? ""),
            maxLinesRendered: Math.max(input.maxLinesRendered, newLines.length),
            previousViewportTop: Math.max(prevViewportTop, finalCursorRow - height + 1),
            previousLines: newLines,
            previousWidth: width,
            previousHeight: height,
            clearLiveMarkers: true,
        };
    }

    commitHardwareCursor(input) {
        return {
            hardwareCursorRow: input.targetRow,
            hardwareCursorCol: input.targetCol,
        };
    }

    commitHiddenHardwareCursor() {
        return {
            hardwareCursorCol: 0,
        };
    }
}
