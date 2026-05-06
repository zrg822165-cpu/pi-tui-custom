/**
 * Minimal TUI implementation with differential rendering
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { isKeyRelease, matchesKey } from "./keys.js";
import { getCapabilities, isImageLine, setCellDimensions } from "./terminal-image.js";
import { extractSegments, normalizeTerminalOutput, sliceByColumn, sliceWithWidth, visibleWidth } from "./utils.js";
import { createDefaultFramePlanner, createDefaultFrameRuntime, createDefaultFrameStateAdapter, createDefaultPatchEngine, createDefaultPatchWriter } from "../../../../patch-engine/index.mjs";
/** Type guard to check if a component implements Focusable */
export function isFocusable(component) {
    return component !== null && "focused" in component;
}
/**
 * Cursor position marker - APC (Application Program Command) sequence.
 * This is a zero-width escape sequence that terminals ignore.
 * Components emit this at the cursor position when focused.
 * TUI finds and strips this marker, then positions the hardware cursor there.
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";
export { visibleWidth };
/** Parse a SizeValue into absolute value given a reference size */
function parseSizeValue(value, referenceSize) {
    if (value === undefined)
        return undefined;
    if (typeof value === "number")
        return value;
    // Parse percentage string like "50%"
    const match = value.match(/^(\d+(?:\.\d+)?)%$/);
    if (match) {
        return Math.floor((referenceSize * parseFloat(match[1])) / 100);
    }
    return undefined;
}
function isTermuxSession() {
    return Boolean(process.env.TERMUX_VERSION);
}
const LINE_RESET_CACHE_SIZE = 2048;
const lineResetCache = new Map();
function normalizeLineWithReset(line) {
    const cached = lineResetCache.get(line);
    if (cached !== undefined) {
        return cached;
    }
    const normalized = normalizeTerminalOutput(line) + TUI.SEGMENT_RESET;
    if (lineResetCache.size >= LINE_RESET_CACHE_SIZE) {
        const firstKey = lineResetCache.keys().next().value;
        if (firstKey !== undefined) {
            lineResetCache.delete(firstKey);
        }
    }
    lineResetCache.set(line, normalized);
    return normalized;
}
function getComponentName(component) {
    return component?.constructor?.name || "AnonymousComponent";
}
function componentCacheWouldHit(component, width) {
    if (!component || typeof component !== "object") {
        return false;
    }
    if (component instanceof Container) {
        return component.cacheable === true &&
            component.dirty !== true &&
            component.cachedWidth === width &&
            Array.isArray(component.cachedLines);
    }
    if (Array.isArray(component.cachedLines) && component.cachedWidth === width) {
        if ("cachedText" in component || "text" in component) {
            return component.cachedText === component.text;
        }
        return true;
    }
    return false;
}
function recordComponentTiming(component, width, durationMs, lineCount, cacheHit, owner = "") {
    const logPath = process.env.PI_TUI_COMPONENT_TIMING_LOG;
    if (!logPath) {
        return;
    }
    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify({
            ts: Date.now(),
            component: getComponentName(component),
            owner,
            width,
            ms: Number(durationMs.toFixed(3)),
            lines: lineCount,
            cacheHit,
        }) + "\n");
    }
    catch {
        // Diagnostics must never affect rendering.
    }
}
function renderComponentWithTiming(component, width, owner) {
    const shouldLog = Boolean(process.env.PI_TUI_COMPONENT_TIMING_LOG);
    if (!shouldLog) {
        return component.render(width);
    }
    const cacheHit = componentCacheWouldHit(component, width);
    const start = performance.now();
    const lines = component.render(width);
    recordComponentTiming(component, width, performance.now() - start, lines.length, cacheHit, owner);
    return lines;
}
/**
 * Container - a component that contains other components
 */
export class Container {
    children = [];
    parentContainer;
    cachedWidth;
    cachedLines;
    visibleTailLines;
    dirty = true;
    __piDirtyVersion = 0;
    cacheable = true;
    __piRenderCacheSafe = true;
    appendOnlyCacheEnabled = false;
    appendChildCache = [];
    appendLastStats = undefined;
    appendLastFirstDirtyChildIndex = undefined;
    appendLastCachedTranscriptLines = 0;
    setAppendOnlyCacheEnabled(enabled) {
        const next = enabled && process.env.PI_TUI_APPEND_CACHE !== "0";
        if (this.appendOnlyCacheEnabled === next) {
            return;
        }
        this.appendOnlyCacheEnabled = next;
        this.resetAppendOnlyCache();
        this.markDirty();
    }
    resetAppendOnlyCache() {
        this.appendChildCache = [];
        this.appendLastStats = undefined;
        this.appendLastFirstDirtyChildIndex = undefined;
        this.appendLastCachedTranscriptLines = 0;
    }
    setVisibleTailLines(maxLines) {
        const next = maxLines === undefined ? undefined : Math.max(1, Math.floor(maxLines));
        if (this.visibleTailLines === next) {
            return;
        }
        this.visibleTailLines = next;
        this.dirty = true;
        this.__piDirtyVersion++;
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
        this.parentContainer?.markDirty?.();
    }
    applyVisibleTail(lines) {
        const maxLines = this.visibleTailLines;
        if (maxLines === undefined || lines.length <= maxLines) {
            return lines;
        }
        return lines.slice(lines.length - maxLines);
    }
    renderVisibleTail(width, canUseCache) {
        const maxLines = this.visibleTailLines;
        if (maxLines === undefined) {
            return undefined;
        }
        if (canUseCache && !this.dirty && this.cachedWidth === width && this.cachedLines) {
            return this.cachedLines;
        }
        const chunks = [];
        let totalLines = 0;
        for (let i = this.children.length - 1; i >= 0 && totalLines < maxLines; i--) {
            const childLines = renderComponentWithTiming(this.children[i], width, "visible-tail");
            if (childLines.length === 0) {
                continue;
            }
            if (totalLines > 0 && totalLines + childLines.length > maxLines) {
                break;
            }
            chunks.push(childLines);
            totalLines += childLines.length;
        }
        const lines = [];
        for (let i = chunks.length - 1; i >= 0; i--) {
            for (const line of chunks[i]) {
                lines.push(line);
            }
        }
        const tail = lines;
        if (canUseCache) {
            this.cachedWidth = width;
            this.cachedLines = tail;
            this.dirty = false;
        }
        return tail;
    }
    isCacheSafeChild(component) {
        return component?.__piRenderCacheSafe === true;
    }
    attachChild(component) {
        if (component && typeof component === "object") {
            component.parentContainer = this;
        }
    }
    detachChild(component) {
        if (component && typeof component === "object" && component.parentContainer === this) {
            component.parentContainer = undefined;
        }
    }
    getChildDirtyVersion(component) {
        return typeof component?.__piDirtyVersion === "number" ? component.__piDirtyVersion : 0;
    }
    isChildDirty(component) {
        return component?.dirty === true;
    }
    markDirty() {
        this.__piDirtyVersion++;
        if (this.dirty) {
            this.parentContainer?.markDirty?.();
            return;
        }
        this.dirty = true;
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
        this.parentContainer?.markDirty?.();
    }
    addChild(component) {
        this.attachChild(component);
        this.children.push(component);
        if (this.appendOnlyCacheEnabled) {
            const index = this.children.length - 1;
            this.appendLastFirstDirtyChildIndex = this.appendLastFirstDirtyChildIndex === undefined
                ? index
                : Math.min(this.appendLastFirstDirtyChildIndex, index);
        }
        this.markDirty();
    }
    removeChild(component) {
        const index = this.children.indexOf(component);
        if (index !== -1) {
            this.detachChild(component);
            this.children.splice(index, 1);
            this.resetAppendOnlyCache();
            this.markDirty();
        }
    }
    clear() {
        for (const child of this.children) {
            this.detachChild(child);
        }
        this.children = [];
        this.resetAppendOnlyCache();
        this.markDirty();
    }
    invalidate() {
        this.resetAppendOnlyCache();
        this.markDirty();
        for (const child of this.children) {
            child.invalidate?.();
        }
    }
    renderAppendOnly(width) {
        if (!this.cacheable || this.visibleTailLines !== undefined) {
            this.appendLastStats = undefined;
            return undefined;
        }
        if (!this.appendOnlyCacheEnabled || process.env.PI_TUI_APPEND_CACHE === "0") {
            this.appendLastStats = undefined;
            return undefined;
        }
        let firstDirty = -1;
        const childCount = this.children.length;
        if (this.appendChildCache.length > childCount) {
            this.appendChildCache.length = childCount;
        }
        for (let i = 0; i < childCount; i++) {
            const child = this.children[i];
            const entry = this.appendChildCache[i];
            if (!entry ||
                entry.component !== child ||
                entry.width !== width ||
                entry.version !== this.getChildDirtyVersion(child) ||
                this.isChildDirty(child)) {
                firstDirty = i;
                break;
            }
        }
        if (firstDirty === -1 && this.appendChildCache.length < childCount) {
            firstDirty = this.appendChildCache.length;
        }
        if (firstDirty === -1 && !this.dirty && this.cachedWidth === width && this.cachedLines) {
            this.appendLastStats = {
                hits: childCount,
                misses: 0,
                firstDirtyChildIndex: undefined,
                cachedTranscriptLines: this.cachedLines.length,
            };
            return this.cachedLines;
        }
        if (firstDirty === -1) {
            firstDirty = 0;
        }
        const lines = [];
        let hits = 0;
        let misses = 0;
        let cachedTranscriptLines = 0;
        for (let i = 0; i < firstDirty; i++) {
            const entry = this.appendChildCache[i];
            if (!entry) {
                firstDirty = i;
                break;
            }
            hits++;
            cachedTranscriptLines += entry.lines.length;
            for (const line of entry.lines) {
                lines.push(line);
            }
        }
        for (let i = firstDirty; i < childCount; i++) {
            const child = this.children[i];
            const childLines = renderComponentWithTiming(child, width, "append-only-miss");
            misses++;
            this.appendChildCache[i] = {
                component: child,
                width,
                version: this.getChildDirtyVersion(child),
                lines: childLines,
            };
            for (const line of childLines) {
                lines.push(line);
            }
        }
        if (this.appendChildCache.length > childCount) {
            this.appendChildCache.length = childCount;
        }
        this.cachedWidth = width;
        this.cachedLines = lines;
        this.dirty = false;
        this.appendLastFirstDirtyChildIndex = undefined;
        this.appendLastCachedTranscriptLines = cachedTranscriptLines;
        this.appendLastStats = {
            hits,
            misses,
            firstDirtyChildIndex: firstDirty,
            cachedTranscriptLines,
        };
        return lines;
    }
    getAppendOnlyStats() {
        return this.appendLastStats;
    }
    render(width) {
        const canUseCache = this.cacheable && this.children.every((child) => this.isCacheSafeChild(child));
        const visibleTailLines = this.renderVisibleTail(width, canUseCache);
        if (visibleTailLines) {
            return visibleTailLines;
        }
        const appendOnlyLines = this.renderAppendOnly(width);
        if (appendOnlyLines) {
            return appendOnlyLines;
        }
        if (canUseCache && !this.dirty && this.cachedWidth === width && this.cachedLines) {
            return this.applyVisibleTail(this.cachedLines);
        }
        const lines = [];
        for (const child of this.children) {
            const childLines = renderComponentWithTiming(child, width, "container");
            for (const line of childLines) {
                lines.push(line);
            }
        }
        if (canUseCache) {
            this.cachedWidth = width;
            this.cachedLines = lines;
            this.dirty = false;
        }
        return this.applyVisibleTail(lines);
    }
}
/**
 * TUI - Main class for managing terminal UI with differential rendering
 */
export class TUI extends Container {
    terminal;
    previousLines = [];
    liveMarkerRows = new Map();
    previousWidth = 0;
    previousHeight = 0;
    focusedComponent = null;
    inputListeners = new Set();
    /** Global callback for debug key (Shift+Ctrl+D). Called before input is forwarded to focused component. */
    onDebug;
    renderRequested = false;
    renderTimer;
    lastRenderAt = 0;
    static MIN_RENDER_INTERVAL_MS = 16;
    cursorRow = 0; // Logical cursor row (end of rendered content)
    hardwareCursorRow = 0; // Actual terminal cursor row (may differ due to IME positioning)
    hardwareCursorCol = 0; // Actual terminal cursor column
    showHardwareCursor = process.env.PI_HARDWARE_CURSOR === "1";
    clearOnShrink = process.env.PI_CLEAR_ON_SHRINK === "1"; // Clear empty rows when content shrinks (default: off)
    maxLinesRendered = 0; // Track terminal's working area (max lines ever rendered)
    previousViewportTop = 0; // Track previous viewport top for resize-aware cursor moves
    fullRedrawCount = 0;
    renderRequestCount = 0;
    forcedRenderRequestCount = 0;
    lastRenderReason = "";
    patchEngine = createDefaultPatchEngine();
    patchWriter = createDefaultPatchWriter();
    frameStateAdapter = createDefaultFrameStateAdapter();
    framePlanner = createDefaultFramePlanner();
    frameRuntime = createDefaultFrameRuntime();
    stopped = false;
    // Overlay stack for modal components rendered on top of base content
    focusOrderCounter = 0;
    overlayStack = [];
    constructor(terminal, showHardwareCursor) {
        super();
        this.terminal = terminal;
        this.cacheable = false;
        if (showHardwareCursor !== undefined) {
            this.showHardwareCursor = showHardwareCursor;
        }
    }
    get fullRedraws() {
        return this.fullRedrawCount;
    }
    getShowHardwareCursor() {
        return this.showHardwareCursor;
    }
    setShowHardwareCursor(enabled) {
        if (this.showHardwareCursor === enabled)
            return;
        this.showHardwareCursor = enabled;
        if (!enabled) {
            this.terminal.hideCursor();
        }
        this.requestRender();
    }
    getClearOnShrink() {
        return this.clearOnShrink;
    }
    /**
     * Set whether to trigger full re-render when content shrinks.
     * When true (default), empty rows are cleared when content shrinks.
     * When false, empty rows remain (reduces redraws on slower terminals).
     */
    setClearOnShrink(enabled) {
        this.clearOnShrink = enabled;
    }
    setFocus(component) {
        // Clear focused flag on old component
        if (isFocusable(this.focusedComponent)) {
            this.focusedComponent.focused = false;
        }
        this.focusedComponent = component;
        // Set focused flag on new component
        if (isFocusable(component)) {
            component.focused = true;
        }
    }
    /**
     * Show an overlay component with configurable positioning and sizing.
     * Returns a handle to control the overlay's visibility.
     */
    showOverlay(component, options) {
        const entry = {
            component,
            options,
            preFocus: this.focusedComponent,
            hidden: false,
            focusOrder: ++this.focusOrderCounter,
        };
        this.overlayStack.push(entry);
        // Only focus if overlay is actually visible
        if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
            this.setFocus(component);
        }
        this.terminal.hideCursor();
        this.requestRender();
        // Return handle for controlling this overlay
        return {
            hide: () => {
                const index = this.overlayStack.indexOf(entry);
                if (index !== -1) {
                    this.overlayStack.splice(index, 1);
                    // Restore focus if this overlay had focus
                    if (this.focusedComponent === component) {
                        const topVisible = this.getTopmostVisibleOverlay();
                        this.setFocus(topVisible?.component ?? entry.preFocus);
                    }
                    if (this.overlayStack.length === 0)
                        this.terminal.hideCursor();
                    this.requestRender();
                }
            },
            setHidden: (hidden) => {
                if (entry.hidden === hidden)
                    return;
                entry.hidden = hidden;
                // Update focus when hiding/showing
                if (hidden) {
                    // If this overlay had focus, move focus to next visible or preFocus
                    if (this.focusedComponent === component) {
                        const topVisible = this.getTopmostVisibleOverlay();
                        this.setFocus(topVisible?.component ?? entry.preFocus);
                    }
                }
                else {
                    // Restore focus to this overlay when showing (if it's actually visible)
                    if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
                        entry.focusOrder = ++this.focusOrderCounter;
                        this.setFocus(component);
                    }
                }
                this.requestRender();
            },
            isHidden: () => entry.hidden,
            focus: () => {
                if (!this.overlayStack.includes(entry) || !this.isOverlayVisible(entry))
                    return;
                if (this.focusedComponent !== component) {
                    this.setFocus(component);
                }
                entry.focusOrder = ++this.focusOrderCounter;
                this.requestRender();
            },
            unfocus: () => {
                if (this.focusedComponent !== component)
                    return;
                const topVisible = this.getTopmostVisibleOverlay();
                this.setFocus(topVisible && topVisible !== entry ? topVisible.component : entry.preFocus);
                this.requestRender();
            },
            isFocused: () => this.focusedComponent === component,
        };
    }
    /** Hide the topmost overlay and restore previous focus. */
    hideOverlay() {
        const overlay = this.overlayStack.pop();
        if (!overlay)
            return;
        if (this.focusedComponent === overlay.component) {
            // Find topmost visible overlay, or fall back to preFocus
            const topVisible = this.getTopmostVisibleOverlay();
            this.setFocus(topVisible?.component ?? overlay.preFocus);
        }
        if (this.overlayStack.length === 0)
            this.terminal.hideCursor();
        this.requestRender();
    }
    /** Check if there are any visible overlays */
    hasOverlay() {
        return this.overlayStack.some((o) => this.isOverlayVisible(o));
    }
    /** Check if an overlay entry is currently visible */
    isOverlayVisible(entry) {
        if (entry.hidden)
            return false;
        if (entry.options?.visible) {
            return entry.options.visible(this.terminal.columns, this.terminal.rows);
        }
        return true;
    }
    /** Find the topmost visible capturing overlay, if any */
    getTopmostVisibleOverlay() {
        for (let i = this.overlayStack.length - 1; i >= 0; i--) {
            if (this.overlayStack[i].options?.nonCapturing)
                continue;
            if (this.isOverlayVisible(this.overlayStack[i])) {
                return this.overlayStack[i];
            }
        }
        return undefined;
    }
    invalidate() {
        super.invalidate();
        for (const overlay of this.overlayStack)
            overlay.component.invalidate?.();
    }
    start() {
        this.stopped = false;
        this.terminal.start((data) => this.handleInput(data), () => this.requestRender());
        this.terminal.hideCursor();
        this.queryCellSize();
        this.requestRender();
    }
    addInputListener(listener) {
        this.inputListeners.add(listener);
        return () => {
            this.inputListeners.delete(listener);
        };
    }
    removeInputListener(listener) {
        this.inputListeners.delete(listener);
    }
    queryCellSize() {
        // Only query if terminal supports images (cell size is only used for image rendering)
        if (!getCapabilities().images) {
            return;
        }
        // Query terminal for cell size in pixels: CSI 16 t
        // Response format: CSI 6 ; height ; width t
        this.terminal.write("\x1b[16t");
    }
    stop() {
        this.stopped = true;
        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = undefined;
        }
        // Move cursor to the end of the content to prevent overwriting/artifacts on exit
        if (this.previousLines.length > 0) {
            const targetRow = this.previousLines.length; // Line after the last content
            const lineDiff = targetRow - this.hardwareCursorRow;
            if (lineDiff > 0) {
                this.terminal.write(`\x1b[${lineDiff}B`);
            }
            else if (lineDiff < 0) {
                this.terminal.write(`\x1b[${-lineDiff}A`);
            }
            this.terminal.write("\r\n");
        }
        this.terminal.showCursor();
        this.terminal.stop();
    }
    requestRender(force = false, reason = "") {
        this.renderRequestCount++;
        if (reason) {
            this.lastRenderReason = reason;
        }
        if (force) {
            this.forcedRenderRequestCount++;
            this.previousLines = [];
            this.liveMarkerRows.clear();
            this.previousWidth = -1; // -1 triggers widthChanged, forcing a full clear
            this.previousHeight = -1; // -1 triggers heightChanged, forcing a full clear
            this.cursorRow = 0;
            this.hardwareCursorRow = 0;
            this.hardwareCursorCol = 0;
            this.maxLinesRendered = 0;
            this.previousViewportTop = 0;
            if (this.renderTimer) {
                clearTimeout(this.renderTimer);
                this.renderTimer = undefined;
            }
            this.renderRequested = true;
            process.nextTick(() => {
                if (this.stopped || !this.renderRequested) {
                    return;
                }
                this.renderRequested = false;
                this.lastRenderAt = performance.now();
                this.doRender();
            });
            return;
        }
        if (this.renderRequested)
            return;
        this.renderRequested = true;
        process.nextTick(() => this.scheduleRender());
    }
    scheduleRender() {
        if (this.stopped || this.renderTimer || !this.renderRequested) {
            return;
        }
        const elapsed = performance.now() - this.lastRenderAt;
        const delay = Math.max(0, TUI.MIN_RENDER_INTERVAL_MS - elapsed);
        this.renderTimer = setTimeout(() => {
            this.renderTimer = undefined;
            if (this.stopped || !this.renderRequested) {
                return;
            }
            this.renderRequested = false;
            this.lastRenderAt = performance.now();
            this.doRender();
            if (this.renderRequested) {
                this.scheduleRender();
            }
        }, delay);
    }
    recordFrameTiming(entry) {
        const logPath = process.env.PI_TUI_FRAME_TIMING_LOG;
        if (!logPath) {
            return;
        }
        try {
            const perfDetail = process.env.PI_TUI_PERF_DETAIL === "1"
                ? {
                    reason: entry.reason ?? this.lastRenderReason,
                    requestRenders: this.renderRequestCount,
                    forcedRequestRenders: this.forcedRenderRequestCount,
                    dirtyRoot: this.dirty === true,
                    dirtyChildren: this.children.filter((child) => child?.dirty === true).length,
                    lineCount: entry.lineCount ?? this.previousLines.length,
                }
                : {};
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.appendFileSync(logPath, JSON.stringify({
                ts: Date.now(),
                ...entry,
                ...perfDetail,
                fullRedraws: this.fullRedrawCount,
            }) + "\n");
        }
        catch {
            // Frame timing is diagnostic-only; rendering must never depend on it.
        }
    }
    patchMarkedLine(marker, nextLine) {
        if (this.stopped || this.renderRequested || !marker || this.previousLines.length === 0) {
            return false;
        }
        if (this.overlayStack.some((entry) => this.isOverlayVisible(entry))) {
            return false;
        }
        const width = this.terminal.columns;
        const height = this.terminal.rows;
        if (this.previousWidth !== width || this.previousHeight !== height) {
            return false;
        }
        if (!nextLine || isImageLine(nextLine) || visibleWidth(nextLine) > width) {
            return false;
        }
        let targetRow = this.liveMarkerRows.get(marker) ?? -1;
        if (targetRow < 0 || targetRow >= this.previousLines.length || !this.previousLines[targetRow]?.includes(marker)) {
            targetRow = this.previousLines.findIndex((line) => line.includes(marker));
            if (targetRow === -1) {
                this.liveMarkerRows.delete(marker);
                return false;
            }
            this.liveMarkerRows.set(marker, targetRow);
        }
        if (targetRow === -1) {
            return false;
        }
        const frameStart = performance.now();
        const viewportTop = this.previousViewportTop;
        const viewportBottom = viewportTop + height - 1;
        if (targetRow < viewportTop ||
            targetRow > viewportBottom ||
            this.hardwareCursorRow < viewportTop ||
            this.hardwareCursorRow > viewportBottom) {
            return false;
        }
        const originalRow = this.hardwareCursorRow;
        const originalCol = this.hardwareCursorCol;
        const buffer = this.patchEngine.buildMarkedLinePatch({
            targetRow,
            originalRow,
            originalCol,
            nextLine,
        });
        const writeStart = performance.now();
        this.terminal.write(buffer);
        const writeMs = performance.now() - writeStart;
        this.previousLines[targetRow] = nextLine;
        this.liveMarkerRows.set(marker, targetRow);
        this.recordFrameTiming({
            kind: "patchMarkedLine",
            total: performance.now() - frameStart,
            render: 0,
            diff: 0,
            write: writeMs,
            patches: 1,
            lineCount: this.previousLines.length,
            fullRedraw: false,
        });
        return true;
    }
    handleInput(data) {
        if (this.inputListeners.size > 0) {
            let current = data;
            for (const listener of this.inputListeners) {
                const result = listener(current);
                if (result?.consume) {
                    return;
                }
                if (result?.data !== undefined) {
                    current = result.data;
                }
            }
            if (current.length === 0) {
                return;
            }
            data = current;
        }
        // Consume terminal cell size responses without blocking unrelated input.
        if (this.consumeCellSizeResponse(data)) {
            return;
        }
        // Global debug key handler (Shift+Ctrl+D)
        if (matchesKey(data, "shift+ctrl+d") && this.onDebug) {
            this.onDebug();
            return;
        }
        // If focused component is an overlay, verify it's still visible
        // (visibility can change due to terminal resize or visible() callback)
        const focusedOverlay = this.overlayStack.find((o) => o.component === this.focusedComponent);
        if (focusedOverlay && !this.isOverlayVisible(focusedOverlay)) {
            // Focused overlay is no longer visible, redirect to topmost visible overlay
            const topVisible = this.getTopmostVisibleOverlay();
            if (topVisible) {
                this.setFocus(topVisible.component);
            }
            else {
                // No visible overlays, restore to preFocus
                this.setFocus(focusedOverlay.preFocus);
            }
        }
        // Pass input to focused component (including Ctrl+C)
        // The focused component can decide how to handle Ctrl+C
        if (this.focusedComponent?.handleInput) {
            // Filter out key release events unless component opts in
            if (isKeyRelease(data) && !this.focusedComponent.wantsKeyRelease) {
                return;
            }
            this.focusedComponent.handleInput(data);
            this.requestRender();
        }
    }
    consumeCellSizeResponse(data) {
        // Response format: ESC [ 6 ; height ; width t
        const match = data.match(/^\x1b\[6;(\d+);(\d+)t$/);
        if (!match) {
            return false;
        }
        const heightPx = parseInt(match[1], 10);
        const widthPx = parseInt(match[2], 10);
        if (heightPx <= 0 || widthPx <= 0) {
            return true;
        }
        setCellDimensions({ widthPx, heightPx });
        // Invalidate all components so images re-render with correct dimensions.
        this.invalidate();
        this.requestRender();
        return true;
    }
    /**
     * Resolve overlay layout from options.
     * Returns { width, row, col, maxHeight } for rendering.
     */
    resolveOverlayLayout(options, overlayHeight, termWidth, termHeight) {
        const opt = options ?? {};
        // Parse margin (clamp to non-negative)
        const margin = typeof opt.margin === "number"
            ? { top: opt.margin, right: opt.margin, bottom: opt.margin, left: opt.margin }
            : (opt.margin ?? {});
        const marginTop = Math.max(0, margin.top ?? 0);
        const marginRight = Math.max(0, margin.right ?? 0);
        const marginBottom = Math.max(0, margin.bottom ?? 0);
        const marginLeft = Math.max(0, margin.left ?? 0);
        // Available space after margins
        const availWidth = Math.max(1, termWidth - marginLeft - marginRight);
        const availHeight = Math.max(1, termHeight - marginTop - marginBottom);
        // === Resolve width ===
        let width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
        // Apply minWidth
        if (opt.minWidth !== undefined) {
            width = Math.max(width, opt.minWidth);
        }
        // Clamp to available space
        width = Math.max(1, Math.min(width, availWidth));
        // === Resolve maxHeight ===
        let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
        // Clamp to available space
        if (maxHeight !== undefined) {
            maxHeight = Math.max(1, Math.min(maxHeight, availHeight));
        }
        // Effective overlay height (may be clamped by maxHeight)
        const effectiveHeight = maxHeight !== undefined ? Math.min(overlayHeight, maxHeight) : overlayHeight;
        // === Resolve position ===
        let row;
        let col;
        if (opt.row !== undefined) {
            if (typeof opt.row === "string") {
                // Percentage: 0% = top, 100% = bottom (overlay stays within bounds)
                const match = opt.row.match(/^(\d+(?:\.\d+)?)%$/);
                if (match) {
                    const maxRow = Math.max(0, availHeight - effectiveHeight);
                    const percent = parseFloat(match[1]) / 100;
                    row = marginTop + Math.floor(maxRow * percent);
                }
                else {
                    // Invalid format, fall back to center
                    row = this.resolveAnchorRow("center", effectiveHeight, availHeight, marginTop);
                }
            }
            else {
                // Absolute row position
                row = opt.row;
            }
        }
        else {
            // Anchor-based (default: center)
            const anchor = opt.anchor ?? "center";
            row = this.resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop);
        }
        if (opt.col !== undefined) {
            if (typeof opt.col === "string") {
                // Percentage: 0% = left, 100% = right (overlay stays within bounds)
                const match = opt.col.match(/^(\d+(?:\.\d+)?)%$/);
                if (match) {
                    const maxCol = Math.max(0, availWidth - width);
                    const percent = parseFloat(match[1]) / 100;
                    col = marginLeft + Math.floor(maxCol * percent);
                }
                else {
                    // Invalid format, fall back to center
                    col = this.resolveAnchorCol("center", width, availWidth, marginLeft);
                }
            }
            else {
                // Absolute column position
                col = opt.col;
            }
        }
        else {
            // Anchor-based (default: center)
            const anchor = opt.anchor ?? "center";
            col = this.resolveAnchorCol(anchor, width, availWidth, marginLeft);
        }
        // Apply offsets
        if (opt.offsetY !== undefined)
            row += opt.offsetY;
        if (opt.offsetX !== undefined)
            col += opt.offsetX;
        // Clamp to terminal bounds (respecting margins)
        row = Math.max(marginTop, Math.min(row, termHeight - marginBottom - effectiveHeight));
        col = Math.max(marginLeft, Math.min(col, termWidth - marginRight - width));
        return { width, row, col, maxHeight };
    }
    resolveAnchorRow(anchor, height, availHeight, marginTop) {
        switch (anchor) {
            case "top-left":
            case "top-center":
            case "top-right":
                return marginTop;
            case "bottom-left":
            case "bottom-center":
            case "bottom-right":
                return marginTop + availHeight - height;
            case "left-center":
            case "center":
            case "right-center":
                return marginTop + Math.floor((availHeight - height) / 2);
        }
    }
    resolveAnchorCol(anchor, width, availWidth, marginLeft) {
        switch (anchor) {
            case "top-left":
            case "left-center":
            case "bottom-left":
                return marginLeft;
            case "top-right":
            case "right-center":
            case "bottom-right":
                return marginLeft + availWidth - width;
            case "top-center":
            case "center":
            case "bottom-center":
                return marginLeft + Math.floor((availWidth - width) / 2);
        }
    }
    /** Composite all overlays into content lines (sorted by focusOrder, higher = on top). */
    compositeOverlays(lines, termWidth, termHeight) {
        if (this.overlayStack.length === 0)
            return lines;
        const result = [...lines];
        // Pre-render all visible overlays and calculate positions
        const rendered = [];
        let minLinesNeeded = result.length;
        const visibleEntries = this.overlayStack.filter((e) => this.isOverlayVisible(e));
        visibleEntries.sort((a, b) => a.focusOrder - b.focusOrder);
        for (const entry of visibleEntries) {
            const { component, options } = entry;
            // Get layout with height=0 first to determine width and maxHeight
            // (width and maxHeight don't depend on overlay height)
            const { width, maxHeight } = this.resolveOverlayLayout(options, 0, termWidth, termHeight);
            // Render component at calculated width
            let overlayLines = component.render(width);
            // Apply maxHeight if specified
            if (maxHeight !== undefined && overlayLines.length > maxHeight) {
                overlayLines = overlayLines.slice(0, maxHeight);
            }
            // Get final row/col with actual overlay height
            const { row, col } = this.resolveOverlayLayout(options, overlayLines.length, termWidth, termHeight);
            rendered.push({ overlayLines, row, col, w: width });
            minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
        }
        // Pad to at least terminal height so overlays have screen-relative positions.
        // Excludes maxLinesRendered: the historical high-water mark caused self-reinforcing
        // inflation that pushed content into scrollback on terminal widen.
        const workingHeight = Math.max(result.length, termHeight, minLinesNeeded);
        // Extend result with empty lines if content is too short for overlay placement or working area
        while (result.length < workingHeight) {
            result.push("");
        }
        const viewportStart = Math.max(0, workingHeight - termHeight);
        // Composite each overlay
        for (const { overlayLines, row, col, w } of rendered) {
            for (let i = 0; i < overlayLines.length; i++) {
                const idx = viewportStart + row + i;
                if (idx >= 0 && idx < result.length) {
                    // Defensive: truncate overlay line to declared width before compositing
                    // (components should already respect width, but this ensures it)
                    const truncatedOverlayLine = visibleWidth(overlayLines[i]) > w ? sliceByColumn(overlayLines[i], 0, w, true) : overlayLines[i];
                    result[idx] = this.compositeLineAt(result[idx], truncatedOverlayLine, col, w, termWidth);
                }
            }
        }
        return result;
    }
    static SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";
    applyLineResets(lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!isImageLine(line)) {
                lines[i] = normalizeLineWithReset(line);
            }
        }
        return lines;
    }
    /** Splice overlay content into a base line at a specific column. Single-pass optimized. */
    compositeLineAt(baseLine, overlayLine, startCol, overlayWidth, totalWidth) {
        if (isImageLine(baseLine))
            return baseLine;
        // Single pass through baseLine extracts both before and after segments
        const afterStart = startCol + overlayWidth;
        const base = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, true);
        // Extract overlay with width tracking (strict=true to exclude wide chars at boundary)
        const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);
        // Pad segments to target widths
        const beforePad = Math.max(0, startCol - base.beforeWidth);
        const overlayPad = Math.max(0, overlayWidth - overlay.width);
        const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
        const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
        const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
        const afterPad = Math.max(0, afterTarget - base.afterWidth);
        // Compose result
        const r = TUI.SEGMENT_RESET;
        const result = base.before +
            " ".repeat(beforePad) +
            r +
            overlay.text +
            " ".repeat(overlayPad) +
            r +
            base.after +
            " ".repeat(afterPad);
        // CRITICAL: Always verify and truncate to terminal width.
        // This is the final safeguard against width overflow which would crash the TUI.
        // Width tracking can drift from actual visible width due to:
        // - Complex ANSI/OSC sequences (hyperlinks, colors)
        // - Wide characters at segment boundaries
        // - Edge cases in segment extraction
        const resultWidth = visibleWidth(result);
        if (resultWidth <= totalWidth) {
            return result;
        }
        // Truncate with strict=true to ensure we don't exceed totalWidth
        return sliceByColumn(result, 0, totalWidth, true);
    }
    /**
     * Find and extract cursor position from rendered lines.
     * Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
     * Only scans the bottom terminal height lines (visible viewport).
     * @param lines - Rendered lines to search
     * @param height - Terminal height (visible viewport size)
     * @returns Cursor position { row, col } or null if no marker found
     */
    extractCursorPosition(lines, height) {
        // Only scan the bottom `height` lines (visible viewport)
        const viewportTop = Math.max(0, lines.length - height);
        for (let row = lines.length - 1; row >= viewportTop; row--) {
            const line = lines[row];
            const markerIndex = line.indexOf(CURSOR_MARKER);
            if (markerIndex !== -1) {
                // Calculate visual column (width of text before marker)
                const beforeMarker = line.slice(0, markerIndex);
                const col = visibleWidth(beforeMarker);
                // Strip marker from the line
                lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);
                return { row, col };
            }
        }
        return null;
    }
    doRender() {
        if (this.stopped)
            return;
        const frameStart = performance.now();
        let renderMs = 0;
        let diffMs = 0;
        let writeMs = 0;
        let patches = 0;
        let fullRedraw = false;
        let diffScannedLines = 0;
        let diffMode = "full-scan";
        let diffWindowStart = 0;
        const writeFrameBuffer = (buffer) => {
            writeMs += this.frameRuntime.write(this.terminal, buffer).writeMs;
        };
        const applyFrameState = (state) => {
            this.frameRuntime.applyState(this, state);
        };
        const finishFrameTiming = (kind) => {
            const appendStats = process.env.PI_TUI_PERF_DETAIL === "1"
                ? this.children.map((child) => child?.getAppendOnlyStats?.()).find(Boolean)
                : undefined;
            this.recordFrameTiming({
                kind,
                total: performance.now() - frameStart,
                render: renderMs,
                diff: diffMs,
                write: writeMs,
                patches,
                fullRedraw,
                lineCount: newLines.length,
                ...(process.env.PI_TUI_PERF_DETAIL === "1" ? {
                    diffScannedLines,
                    diffMode,
                    diffWindowStart,
                    appendCacheHits: appendStats?.hits ?? 0,
                    appendCacheMisses: appendStats?.misses ?? 0,
                    firstDirtyChildIndex: appendStats?.firstDirtyChildIndex,
                    cachedTranscriptLines: appendStats?.cachedTranscriptLines ?? 0,
                } : {}),
            });
        };
        const width = this.terminal.columns;
        const height = this.terminal.rows;
        let prevViewportTop = this.previousViewportTop;
        let viewportTop = this.previousViewportTop;
        let hardwareCursorRow = this.hardwareCursorRow;
        // Render all components to get new lines
        const renderStart = performance.now();
        let newLines = this.render(width);
        // Composite overlays into the rendered lines (before differential compare)
        if (this.overlayStack.length > 0) {
            newLines = this.compositeOverlays(newLines, width, height);
        }
        // Extract cursor position before applying line resets (marker must be found first)
        const cursorPos = this.extractCursorPosition(newLines, height);
        newLines = this.applyLineResets(newLines);
        renderMs = performance.now() - renderStart;
        // Helper to clear scrollback and viewport and render all new lines
        const fullRender = (clear) => {
            this.fullRedrawCount += 1;
            const result = this.frameRuntime.executeFullRender({
                terminal: this.terminal,
                target: this,
                clear,
                newLines,
                height,
                width,
                maxLinesRendered: this.maxLinesRendered,
                visibleWidth,
                positionHardwareCursor: (nextCursorPos, totalLines) => this.positionHardwareCursor(nextCursorPos, totalLines),
                cursorPos,
            });
            writeMs += result.writeMs;
            patches = result.patches;
            fullRedraw = result.fullRedraw;
            finishFrameTiming(result.timingKind);
        };
        const debugRedraw = process.env.PI_DEBUG_REDRAW === "1";
        const logRedraw = (reason) => {
            if (!debugRedraw)
                return;
            const logPath = path.join(os.homedir(), ".pi", "agent", "pi-debug.log");
            const msg = `[${new Date().toISOString()}] fullRender: ${reason} (prev=${this.previousLines.length}, new=${newLines.length}, height=${height})\n`;
            fs.appendFileSync(logPath, msg);
        };
        const patchViewport = (newViewportTop, reason) => {
            const result = this.frameRuntime.executeViewportPatch({
                terminal: this.terminal,
                target: this,
                newLines,
                oldViewportTop: prevViewportTop,
                newViewportTop,
                height,
                width,
                hardwareCursorRow,
                maxLinesRendered: this.maxLinesRendered,
                visibleWidth,
                isImageLine,
                positionHardwareCursor: (nextCursorPos, totalLines) => this.positionHardwareCursor(nextCursorPos, totalLines),
                cursorPos,
                reason,
            });
            if (result.fallbackFullRender) {
                logRedraw(result.reason);
                fullRender(true);
                return true;
            }
            writeMs += result.writeMs ?? 0;
            patches = result.patches ?? patches;
            diffMode = result.diffMode ?? diffMode;
            finishFrameTiming(result.timingKind);
            return true;
        };
        const diffStart = performance.now();
        const framePlan = this.frameRuntime.planFramePatch({
            terminalWidth: this.terminal.columns,
            terminalHeight: this.terminal.rows,
            previousWidth: this.previousWidth,
            previousHeight: this.previousHeight,
            previousViewportTop: this.previousViewportTop,
            hardwareCursorRow: this.hardwareCursorRow,
            previousLines: this.previousLines,
            newLines,
            isTermux: isTermuxSession(),
            clearOnShrink: this.clearOnShrink,
            maxLinesRendered: this.maxLinesRendered,
            hasOverlays: this.overlayStack.length !== 0,
        });
        const frameInput = framePlan.frameInput;
        prevViewportTop = frameInput.prevViewportTop;
        viewportTop = frameInput.viewportTop;
        hardwareCursorRow = frameInput.hardwareCursorRow;
        const beforeDiffPlan = framePlan.beforeDiffPlan;
        if (beforeDiffPlan.kind === "fullRender") {
            if (beforeDiffPlan.reason) {
                logRedraw(this.frameRuntime.formatFullRenderReason(beforeDiffPlan, {
                    previousWidth: this.previousWidth,
                    previousHeight: this.previousHeight,
                    width,
                    height,
                    maxLinesRendered: this.maxLinesRendered,
                }));
            }
            fullRender(beforeDiffPlan.clear);
            return;
        }
        const changedRange = framePlan.changedRange;
        let firstChanged = changedRange.firstChanged;
        let lastChanged = changedRange.lastChanged;
        const appendedLines = changedRange.appendedLines;
        diffScannedLines = changedRange.diffScannedLines;
        diffMode = changedRange.diffMode;
        diffWindowStart = changedRange.diffWindowStart;
        diffMs += performance.now() - diffStart;
        const appendStart = changedRange.appendStart;
        const afterDiffPlan = framePlan.afterDiffPlan;
        // No changes - but still need to update hardware cursor position if it moved
        if (afterDiffPlan.kind === "noChange") {
            const result = this.frameRuntime.executeNoChange({
                target: this,
                previousViewportTop: prevViewportTop,
                height,
                positionHardwareCursor: (nextCursorPos, totalLines) => this.positionHardwareCursor(nextCursorPos, totalLines),
                cursorPos,
                newLineCount: newLines.length,
            });
            finishFrameTiming(result.timingKind);
            return;
        }
        // All changes are in deleted lines (nothing to render, just clear)
        if (afterDiffPlan.kind === "deleteLines") {
            if (this.previousLines.length > newLines.length) {
                const deleteLinesPlan = framePlan.deleteLinesPlan ?? {
                    targetRow: Math.max(0, newLines.length - 1),
                    lineDiff: 0,
                    extraLines: this.previousLines.length - newLines.length,
                };
                const result = this.frameRuntime.executeDeleteLines({
                    terminal: this.terminal,
                    target: this,
                    targetRow: deleteLinesPlan.targetRow,
                    lineDiff: deleteLinesPlan.lineDiff,
                    extraLines: deleteLinesPlan.extraLines,
                    height,
                    width,
                    newLines,
                    previousViewportTop: prevViewportTop,
                    positionHardwareCursor: (nextCursorPos, totalLines) => this.positionHardwareCursor(nextCursorPos, totalLines),
                    cursorPos,
                });
                if (result.fallbackFullRender) {
                    logRedraw(result.reason);
                    fullRender(true);
                    return;
                }
                writeMs += result.writeMs ?? 0;
                patches = result.patches ?? patches;
            }
            finishFrameTiming("deleteLines");
            return;
        }
        // Differential rendering can only touch what was actually visible.
        // If the first changed line is above the previous viewport, we need a full redraw.
        if (afterDiffPlan.kind === "viewportPatch") {
            patchViewport(afterDiffPlan.newViewportTop, afterDiffPlan.reason);
            return;
        }
        const result = this.frameRuntime.executeDiffRender({
            terminal: this.terminal,
            target: this,
            firstChanged,
            lastChanged,
            appendStart,
            prevViewportTop,
            viewportTop,
            hardwareCursorRow,
            height,
            width,
            newLines,
            maxLinesRendered: this.maxLinesRendered,
            visibleWidth,
            isImageLine,
            debug: process.env.PI_TUI_DEBUG === "1",
            cursorRow: this.cursorRow,
            cursorPos,
            positionHardwareCursor: (nextCursorPos, totalLines) => this.positionHardwareCursor(nextCursorPos, totalLines),
        });
        if (result.crash) {
            const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
            fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
            fs.writeFileSync(crashLogPath, result.crash.crashData);
            this.stop();
            throw new Error(this.patchEngine.buildWideLineErrorMessage({
                violation: result.crash.violation,
                crashLogPath,
            }));
        }
        if (result.debugData) {
            const debugDir = "/tmp/tui";
            fs.mkdirSync(debugDir, { recursive: true });
            const debugPath = path.join(debugDir, `render-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
            fs.writeFileSync(debugPath, result.debugData);
        }
        writeMs += result.writeMs ?? 0;
        patches = result.patches ?? patches;
        finishFrameTiming(result.timingKind);
    }
    /**
     * Position the hardware cursor for IME candidate window.
     * @param cursorPos The cursor position extracted from rendered output, or null
     * @param totalLines Total number of rendered lines
     */
    positionHardwareCursor(cursorPos, totalLines) {
        this.frameRuntime.positionHardwareCursor({
            terminal: this.terminal,
            target: this,
            cursorPos,
            totalLines,
            showHardwareCursor: this.showHardwareCursor,
        });
    }
}
//# sourceMappingURL=tui.js.map
