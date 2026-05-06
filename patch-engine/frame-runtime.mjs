export class FrameRuntime {
    constructor(options) {
        this.patchEngine = options.patchEngine;
        this.patchWriter = options.patchWriter;
        this.frameStateAdapter = options.frameStateAdapter;
        this.framePlanner = options.framePlanner;
        this.frameInputAdapter = options.frameInputAdapter;
    }

    prepareFrameInput(input) {
        return this.frameInputAdapter.prepare(input);
    }

    computeLineDiff(input) {
        return this.frameInputAdapter.computeLineDiff(input);
    }

    planBeforeDiff(input) {
        return this.framePlanner.planBeforeDiff(input);
    }

    planAfterDiff(input) {
        return this.framePlanner.planAfterDiff(input);
    }

    planFramePatch(input) {
        const rust = this.patchEngine.planFramePatch?.(input);
        if (rust) {
            return rust;
        }
        const frameInput = this.prepareFrameInput(input);
        const beforeDiffPlan = this.planBeforeDiff({
            previousLineCount: input.previousLines.length,
            widthChanged: frameInput.widthChanged,
            heightChanged: frameInput.heightChanged,
            isTermux: input.isTermux,
            clearOnShrink: input.clearOnShrink,
            newLineCount: input.newLines.length,
            maxLinesRendered: input.maxLinesRendered,
            hasOverlays: input.hasOverlays,
        });
        if (beforeDiffPlan.kind !== "diff") {
            return { frameInput, beforeDiffPlan };
        }
        const changedRange = this.patchEngine.findChangedRange({
            previousLines: input.previousLines,
            newLines: input.newLines,
            height: frameInput.height,
            previousViewportTop: frameInput.prevViewportTop,
        });
        const afterDiffPlan = this.planAfterDiff({
            firstChanged: changedRange.firstChanged,
            newLineCount: input.newLines.length,
            previousLineCount: input.previousLines.length,
            previousViewportTop: frameInput.prevViewportTop,
            height: frameInput.height,
        });
        let deleteLinesPlan;
        if (afterDiffPlan.kind === "deleteLines" && input.previousLines.length > input.newLines.length) {
            const targetRow = Math.max(0, input.newLines.length - 1);
            deleteLinesPlan = {
                targetRow,
                lineDiff: this.computeLineDiff({
                    targetRow,
                    hardwareCursorRow: frameInput.hardwareCursorRow,
                    prevViewportTop: frameInput.prevViewportTop,
                    viewportTop: frameInput.viewportTop,
                }),
                extraLines: input.previousLines.length - input.newLines.length,
            };
        }
        return { frameInput, beforeDiffPlan, changedRange, afterDiffPlan, deleteLinesPlan };
    }

    write(terminal, buffer) {
        return this.patchWriter.write(terminal, buffer);
    }

    applyState(target, state) {
        if (state.cursorRow !== undefined)
            target.cursorRow = state.cursorRow;
        if (state.hardwareCursorRow !== undefined)
            target.hardwareCursorRow = state.hardwareCursorRow;
        if (state.hardwareCursorCol !== undefined)
            target.hardwareCursorCol = state.hardwareCursorCol;
        if (state.maxLinesRendered !== undefined)
            target.maxLinesRendered = state.maxLinesRendered;
        if (state.previousViewportTop !== undefined)
            target.previousViewportTop = state.previousViewportTop;
        if (state.previousLines !== undefined)
            target.previousLines = state.previousLines;
        if (state.previousWidth !== undefined)
            target.previousWidth = state.previousWidth;
        if (state.previousHeight !== undefined)
            target.previousHeight = state.previousHeight;
        if (state.clearLiveMarkers)
            target.liveMarkerRows?.clear?.();
    }

    formatFullRenderReason(plan, input) {
        if (!plan.reason) {
            return "";
        }
        if (plan.reason === "terminal width changed") {
            return `terminal width changed (${input.previousWidth} -> ${input.width})`;
        }
        if (plan.reason === "terminal height changed") {
            return `terminal height changed (${input.previousHeight} -> ${input.height})`;
        }
        if (plan.reason === "clearOnShrink") {
            return `clearOnShrink (maxLinesRendered=${input.maxLinesRendered})`;
        }
        return plan.reason;
    }

    executeFullRender(input) {
        const {
            terminal,
            target,
            clear,
            newLines,
            height,
            width,
            maxLinesRendered,
            visibleWidth,
            positionHardwareCursor,
            cursorPos,
        } = input;
        const buffer = this.patchEngine.buildFullRenderPatch({ clear, newLines });
        const writeStats = this.write(terminal, buffer);
        this.applyState(target, this.frameStateAdapter.commitFullRender({
            clear,
            newLines,
            height,
            width,
            maxLinesRendered,
            visibleWidth,
        }));
        positionHardwareCursor(cursorPos, newLines.length);
        return {
            writeMs: writeStats.writeMs,
            patches: newLines.length,
            fullRedraw: true,
            timingKind: clear ? "fullRenderClear" : "fullRender",
        };
    }

    executeNoChange(input) {
        const {
            target,
            previousViewportTop,
            height,
            positionHardwareCursor,
            cursorPos,
            newLineCount,
        } = input;
        positionHardwareCursor(cursorPos, newLineCount);
        this.applyState(target, this.frameStateAdapter.commitNoChange({
            previousViewportTop,
            height,
        }));
        return {
            timingKind: "noChange",
        };
    }

    executeDeleteLines(input) {
        const {
            terminal,
            target,
            targetRow,
            lineDiff,
            extraLines,
            height,
            width,
            newLines,
            previousViewportTop,
            positionHardwareCursor,
            cursorPos,
        } = input;
        if (targetRow < previousViewportTop) {
            return {
                fallbackFullRender: true,
                reason: `deleted lines moved viewport up (${targetRow} < ${previousViewportTop})`,
            };
        }
        if (extraLines > height) {
            return {
                fallbackFullRender: true,
                reason: `extraLines > height (${extraLines} > ${height})`,
            };
        }
        const buffer = this.patchEngine.buildDeleteLinesPatch({ lineDiff, extraLines });
        const writeStats = this.write(terminal, buffer);
        this.applyState(target, this.frameStateAdapter.commitDeleteLines({
            targetRow,
            newLines,
            width,
            height,
            previousViewportTop,
        }));
        positionHardwareCursor(cursorPos, newLines.length);
        return {
            writeMs: writeStats.writeMs,
            patches: extraLines,
            timingKind: "deleteLines",
        };
    }

    executeViewportPatch(input) {
        const {
            terminal,
            target,
            newLines,
            oldViewportTop,
            newViewportTop,
            height,
            width,
            hardwareCursorRow,
            maxLinesRendered,
            visibleWidth,
            isImageLine,
            positionHardwareCursor,
            cursorPos,
            reason,
        } = input;
        const viewportRange = this.patchEngine.findViewportChangedRange({
            previousLines: target.previousLines,
            newLines,
            oldViewportTop,
            newViewportTop,
            height,
        });
        const firstScreenChanged = viewportRange.firstScreenChanged;
        const lastScreenChanged = viewportRange.lastScreenChanged;
        if (firstScreenChanged === -1) {
            positionHardwareCursor(cursorPos, newLines.length);
            this.applyState(target, this.frameStateAdapter.commitViewportNoChange({
                newLines,
                width,
                height,
                newViewportTop,
            }));
            return {
                timingKind: "viewportNoChange",
                diffMode: reason,
            };
        }
        const currentScreenRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - oldViewportTop));
        const viewportWideLine = this.patchEngine.findFirstWideLine({
            lines: newLines,
            startLine: newViewportTop + firstScreenChanged,
            endLine: newViewportTop + lastScreenChanged,
            width,
            isImageLine,
            visibleWidth,
        });
        if (viewportWideLine) {
            return {
                fallbackFullRender: true,
                reason: `viewport line too wide (${viewportWideLine.width} > ${width})`,
            };
        }
        const buffer = this.patchEngine.buildViewportPatch({
            firstScreenChanged,
            lastScreenChanged,
            currentScreenRow,
            newViewportTop,
            newLines,
        });
        const writeStats = this.write(terminal, buffer);
        this.applyState(target, this.frameStateAdapter.commitViewportPatch({
            newLines,
            newViewportTop,
            lastScreenChanged,
            width,
            height,
            maxLinesRendered,
            visibleWidth,
        }));
        positionHardwareCursor(cursorPos, newLines.length);
        return {
            writeMs: writeStats.writeMs,
            patches: lastScreenChanged - firstScreenChanged + 1,
            diffMode: reason,
            timingKind: "viewportPatch",
        };
    }

    executeDiffRender(input) {
        const {
            terminal,
            target,
            firstChanged,
            lastChanged,
            appendStart,
            prevViewportTop,
            viewportTop,
            hardwareCursorRow,
            height,
            width,
            newLines,
            maxLinesRendered,
            visibleWidth,
            isImageLine,
            debug,
            cursorRow,
            cursorPos,
            positionHardwareCursor,
        } = input;
        const renderEnd = Math.min(lastChanged, newLines.length - 1);
        const wideLine = this.patchEngine.findFirstWideLine({
            lines: newLines,
            startLine: firstChanged,
            endLine: renderEnd,
            width,
            isImageLine,
            visibleWidth,
        });
        if (wideLine) {
            return {
                crash: {
                    violation: wideLine,
                    crashData: this.patchEngine.buildWideLineCrashReport({
                        violation: wideLine,
                        terminalWidth: width,
                        lines: newLines,
                        visibleWidth,
                    }),
                },
            };
        }
        const diffPatch = this.patchEngine.buildDiffRenderPatch({
            firstChanged,
            renderEnd,
            appendStart,
            prevViewportTop,
            viewportTop,
            hardwareCursorRow,
            height,
            newLines,
            previousLineCount: target.previousLines.length,
        });
        const writeStats = this.write(terminal, diffPatch.buffer);
        let patches = Math.max(0, renderEnd - firstChanged + 1);
        if (target.previousLines.length > newLines.length) {
            patches += target.previousLines.length - newLines.length;
        }
        const previousLinesForDebug = target.previousLines;
        this.applyState(target, this.frameStateAdapter.commitDiffRender({
            newLines,
            finalCursorRow: diffPatch.finalCursorRow,
            prevViewportTop: diffPatch.prevViewportTop,
            height,
            width,
            maxLinesRendered,
            visibleWidth,
        }));
        positionHardwareCursor(cursorPos, newLines.length);
        return {
            writeMs: writeStats.writeMs,
            patches,
            timingKind: "diffRender",
            debugData: debug ? this.patchEngine.buildDebugRenderReport({
                firstChanged,
                viewportTop: diffPatch.viewportTop,
                cursorRow,
                height,
                lineDiff: diffPatch.lineDiff,
                hardwareCursorRow: diffPatch.hardwareCursorRow,
                renderEnd,
                finalCursorRow: diffPatch.finalCursorRow,
                cursorPos,
                newLines,
                previousLines: previousLinesForDebug,
                buffer: diffPatch.buffer,
            }) : undefined,
        };
    }

    positionHardwareCursor(input) {
        const {
            terminal,
            target,
            cursorPos,
            totalLines,
            showHardwareCursor,
        } = input;
        if (!cursorPos || totalLines <= 0) {
            terminal.hideCursor();
            this.applyState(target, this.frameStateAdapter.commitHiddenHardwareCursor());
            return { writeMs: 0 };
        }
        const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
        const targetCol = Math.max(0, cursorPos.col);
        const buffer = this.patchEngine.buildHardwareCursorPatch({
            currentRow: target.hardwareCursorRow,
            targetRow,
            targetCol,
        });
        const writeStats = buffer ? this.write(terminal, buffer) : { writeMs: 0, bytes: 0 };
        this.applyState(target, this.frameStateAdapter.commitHardwareCursor({ targetRow, targetCol }));
        if (showHardwareCursor) {
            terminal.showCursor();
        }
        else {
            terminal.hideCursor();
        }
        return writeStats;
    }
}
