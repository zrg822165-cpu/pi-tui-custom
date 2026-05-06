export class LineDiffPatchEngine {
    findChangedRange(input) {
        const {
            previousLines,
            newLines,
            height,
            previousViewportTop,
        } = input;
        let firstChanged = -1;
        let lastChanged = -1;
        const maxLines = Math.max(newLines.length, previousLines.length);
        const appendedLines = newLines.length > previousLines.length;
        const tailWindow = Math.min(maxLines, Math.max(height * 4, 256));
        const tailStart = Math.max(0, maxLines - tailWindow);
        let diffWindowStart = tailStart;
        let diffScannedLines = 0;
        let diffMode = "full-scan";
        if (appendedLines &&
            previousLines.length > 0 &&
            newLines[previousLines.length - 1] === previousLines[previousLines.length - 1]) {
            firstChanged = previousLines.length;
            lastChanged = newLines.length - 1;
            diffScannedLines = 1;
            diffMode = "append-fast";
        }
        else {
            diffScannedLines = maxLines - tailStart;
            for (let i = tailStart; i < maxLines; i++) {
                const oldLine = i < previousLines.length ? previousLines[i] : "";
                const newLine = i < newLines.length ? newLines[i] : "";
                if (oldLine !== newLine) {
                    if (firstChanged === -1) {
                        firstChanged = i;
                    }
                    lastChanged = i;
                }
            }
            if (firstChanged !== -1) {
                diffMode = "tail-window";
            }
            else if (tailStart <= previousViewportTop) {
                diffMode = "visible-tail-clean";
            }
            else if (tailStart > 0) {
                diffMode = "full-scan";
                diffWindowStart = 0;
                diffScannedLines = maxLines;
                for (let i = 0; i < tailStart; i++) {
                    const oldLine = i < previousLines.length ? previousLines[i] : "";
                    const newLine = i < newLines.length ? newLines[i] : "";
                    if (oldLine !== newLine) {
                        if (firstChanged === -1) {
                            firstChanged = i;
                        }
                        lastChanged = i;
                    }
                }
            }
            else {
                diffMode = "full-scan";
            }
        }
        if (appendedLines) {
            if (firstChanged === -1) {
                firstChanged = previousLines.length;
            }
            lastChanged = newLines.length - 1;
        }
        return {
            firstChanged,
            lastChanged,
            appendedLines,
            appendStart: appendedLines && firstChanged === previousLines.length && firstChanged > 0,
            diffScannedLines,
            diffMode,
            diffWindowStart,
        };
    }

    findViewportChangedRange(input) {
        const {
            previousLines,
            newLines,
            oldViewportTop,
            newViewportTop,
            height,
        } = input;
        const visibleRows = Math.min(height, Math.max(previousLines.length - oldViewportTop, newLines.length - newViewportTop, 0));
        let firstScreenChanged = -1;
        let lastScreenChanged = -1;
        for (let screenRow = 0; screenRow < visibleRows; screenRow++) {
            const oldLine = previousLines[oldViewportTop + screenRow] ?? "";
            const newLine = newLines[newViewportTop + screenRow] ?? "";
            if (oldLine !== newLine) {
                if (firstScreenChanged === -1) {
                    firstScreenChanged = screenRow;
                }
                lastScreenChanged = screenRow;
            }
        }
        return {
            visibleRows,
            firstScreenChanged,
            lastScreenChanged,
            changed: firstScreenChanged !== -1,
        };
    }

    buildMarkedLinePatch(input) {
        const {
            targetRow,
            originalRow,
            originalCol,
            nextLine,
        } = input;
        let buffer = "\x1b[?2026h";
        const rowDelta = targetRow - originalRow;
        if (rowDelta > 0) {
            buffer += `\x1b[${rowDelta}B`;
        }
        else if (rowDelta < 0) {
            buffer += `\x1b[${-rowDelta}A`;
        }
        buffer += `\r\x1b[2K${nextLine}`;
        const backDelta = originalRow - targetRow;
        if (backDelta > 0) {
            buffer += `\x1b[${backDelta}B`;
        }
        else if (backDelta < 0) {
            buffer += `\x1b[${-backDelta}A`;
        }
        buffer += `\x1b[${originalCol + 1}G\x1b[?2026l`;
        return buffer;
    }

    buildFullRenderPatch(input) {
        const { clear, newLines } = input;
        let buffer = "\x1b[?2026h";
        if (clear) {
            buffer += "\x1b[2J\x1b[H\x1b[3J";
        }
        for (let i = 0; i < newLines.length; i++) {
            if (i > 0) {
                buffer += "\r\n";
            }
            buffer += newLines[i];
        }
        buffer += "\x1b[?2026l";
        return buffer;
    }

    buildViewportPatch(input) {
        const {
            firstScreenChanged,
            lastScreenChanged,
            currentScreenRow,
            newViewportTop,
            newLines,
        } = input;
        let buffer = "\x1b[?2026h";
        const rowDelta = firstScreenChanged - currentScreenRow;
        if (rowDelta > 0) {
            buffer += `\x1b[${rowDelta}B`;
        }
        else if (rowDelta < 0) {
            buffer += `\x1b[${-rowDelta}A`;
        }
        for (let screenRow = firstScreenChanged; screenRow <= lastScreenChanged; screenRow++) {
            if (screenRow > firstScreenChanged) {
                buffer += "\x1b[1B";
            }
            buffer += "\r\x1b[2K";
            buffer += newLines[newViewportTop + screenRow] ?? "";
        }
        buffer += "\x1b[?2026l";
        return buffer;
    }

    buildDeleteLinesPatch(input) {
        const { lineDiff, extraLines } = input;
        let buffer = "\x1b[?2026h";
        if (lineDiff > 0) {
            buffer += `\x1b[${lineDiff}B`;
        }
        else if (lineDiff < 0) {
            buffer += `\x1b[${-lineDiff}A`;
        }
        buffer += "\r";
        if (extraLines > 0) {
            buffer += "\x1b[1B";
        }
        for (let i = 0; i < extraLines; i++) {
            buffer += "\r\x1b[2K";
            if (i < extraLines - 1) {
                buffer += "\x1b[1B";
            }
        }
        if (extraLines > 0) {
            buffer += `\x1b[${extraLines}A`;
        }
        buffer += "\x1b[?2026l";
        return buffer;
    }

    buildDiffRenderPatch(input) {
        const {
            firstChanged,
            renderEnd,
            appendStart,
            prevViewportTop: initialPrevViewportTop,
            viewportTop: initialViewportTop,
            hardwareCursorRow: initialHardwareCursorRow,
            height,
            newLines,
            previousLineCount,
        } = input;
        let prevViewportTop = initialPrevViewportTop;
        let viewportTop = initialViewportTop;
        let hardwareCursorRow = initialHardwareCursorRow;
        const computeLineDiff = (targetRow) => {
            const currentScreenRow = hardwareCursorRow - prevViewportTop;
            const targetScreenRow = targetRow - viewportTop;
            return targetScreenRow - currentScreenRow;
        };
        let buffer = "\x1b[?2026h";
        const prevViewportBottom = prevViewportTop + height - 1;
        const moveTargetRow = appendStart ? firstChanged - 1 : firstChanged;
        if (moveTargetRow > prevViewportBottom) {
            const currentScreenRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - prevViewportTop));
            const moveToBottom = height - 1 - currentScreenRow;
            if (moveToBottom > 0) {
                buffer += `\x1b[${moveToBottom}B`;
            }
            const scroll = moveTargetRow - prevViewportBottom;
            buffer += "\r\n".repeat(scroll);
            prevViewportTop += scroll;
            viewportTop += scroll;
            hardwareCursorRow = moveTargetRow;
        }
        const lineDiff = computeLineDiff(moveTargetRow);
        if (lineDiff > 0) {
            buffer += `\x1b[${lineDiff}B`;
        }
        else if (lineDiff < 0) {
            buffer += `\x1b[${-lineDiff}A`;
        }
        buffer += appendStart ? "\r\n" : "\r";
        for (let i = firstChanged; i <= renderEnd; i++) {
            if (i > firstChanged) {
                buffer += "\r\n";
            }
            buffer += "\x1b[2K";
            buffer += newLines[i] ?? "";
        }
        let finalCursorRow = renderEnd;
        if (previousLineCount > newLines.length) {
            if (renderEnd < newLines.length - 1) {
                const moveDown = newLines.length - 1 - renderEnd;
                buffer += `\x1b[${moveDown}B`;
                finalCursorRow = newLines.length - 1;
            }
            const extraLines = previousLineCount - newLines.length;
            for (let i = newLines.length; i < previousLineCount; i++) {
                buffer += "\r\n\x1b[2K";
            }
            buffer += `\x1b[${extraLines}A`;
        }
        buffer += "\x1b[?2026l";
        return {
            buffer,
            finalCursorRow,
            prevViewportTop,
            viewportTop,
            hardwareCursorRow,
            lineDiff,
        };
    }

    buildHardwareCursorPatch(input) {
        const { currentRow, targetRow, targetCol } = input;
        const rowDelta = targetRow - currentRow;
        let buffer = "";
        if (rowDelta > 0) {
            buffer += `\x1b[${rowDelta}B`;
        }
        else if (rowDelta < 0) {
            buffer += `\x1b[${-rowDelta}A`;
        }
        buffer += `\x1b[${targetCol + 1}G`;
        return buffer;
    }

    findFirstWideLine(input) {
        const {
            lines,
            startLine,
            endLine,
            width,
            isImageLine,
            visibleWidth,
        } = input;
        for (let i = startLine; i <= endLine; i++) {
            const line = lines[i] ?? "";
            if (isImageLine(line)) {
                continue;
            }
            const lineWidth = visibleWidth(line);
            if (lineWidth > width) {
                return {
                    index: i,
                    line,
                    width: lineWidth,
                    maxWidth: width,
                };
            }
        }
        return undefined;
    }

    buildWideLineCrashReport(input) {
        const { violation, terminalWidth, lines, visibleWidth, now = new Date() } = input;
        return [
            `Crash at ${now.toISOString()}`,
            `Terminal width: ${terminalWidth}`,
            `Line ${violation.index} visible width: ${violation.width}`,
            "",
            "=== All rendered lines ===",
            ...lines.map((line, index) => `[${index}] (w=${visibleWidth(line)}) ${line}`),
            "",
        ].join("\n");
    }

    buildWideLineErrorMessage(input) {
        const { violation, crashLogPath } = input;
        return [
            `Rendered line ${violation.index} exceeds terminal width (${violation.width} > ${violation.maxWidth}).`,
            "",
            "This is likely caused by a custom TUI component not truncating its output.",
            "Use visibleWidth() to measure and truncateToWidth() to truncate lines.",
            "",
            `Debug log written to: ${crashLogPath}`,
        ].join("\n");
    }

    buildDebugRenderReport(input) {
        const {
            firstChanged,
            viewportTop,
            cursorRow,
            height,
            lineDiff,
            hardwareCursorRow,
            renderEnd,
            finalCursorRow,
            cursorPos,
            newLines,
            previousLines,
            buffer,
        } = input;
        return [
            `firstChanged: ${firstChanged}`,
            `viewportTop: ${viewportTop}`,
            `cursorRow: ${cursorRow}`,
            `height: ${height}`,
            `lineDiff: ${lineDiff}`,
            `hardwareCursorRow: ${hardwareCursorRow}`,
            `renderEnd: ${renderEnd}`,
            `finalCursorRow: ${finalCursorRow}`,
            `cursorPos: ${JSON.stringify(cursorPos)}`,
            `newLines.length: ${newLines.length}`,
            `previousLines.length: ${previousLines.length}`,
            "",
            "=== newLines ===",
            JSON.stringify(newLines, null, 2),
            "",
            "=== previousLines ===",
            JSON.stringify(previousLines, null, 2),
            "",
            "=== buffer ===",
            JSON.stringify(buffer),
        ].join("\n");
    }
}
