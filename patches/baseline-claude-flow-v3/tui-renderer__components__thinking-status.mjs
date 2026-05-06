import { Text, truncateToWidth, TUI } from "@mariozechner/pi-tui";
let nextLiveStatusId = 1;
const LIVE_STATUS_MARKER_PREFIX = "\x1b_pi:live-status:";
const LIVE_STATUS_MARKER_SUFFIX = "\x07";
const THINKING_THRESHOLDS = [
    [60000, "almost done thinking"],
    [45000, "thinking some more"],
    [30000, "thinking more"],
    [15000, "still thinking"],
];
function formatSeconds(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}
function estimateTokens(text) {
    if (!text) {
        return 0;
    }
    let cjk = 0;
    let latin = 0;
    for (const char of text) {
        if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) {
            cjk++;
        }
        else if (!/\s/u.test(char)) {
            latin++;
        }
    }
    return Math.max(1, Math.ceil(cjk * 0.75 + latin / 4));
}
function color256(index, text) {
    return `\x1b[38;5;${index}m${text}\x1b[39m`;
}
function getUsageOutput(event, message) {
    return event?.usage?.output_tokens ??
        event?.usage?.output ??
        event?.partial?.usage?.output ??
        event?.partial?.usage?.output_tokens ??
        message?.usage?.output ??
        message?.usage?.output_tokens ??
        0;
}
function getDelta(event) {
    if (!event || typeof event.delta !== "string") {
        return "";
    }
    return event.delta;
}
function thinkingLabelForElapsed(elapsed) {
    for (const [threshold, label] of THINKING_THRESHOLDS) {
        if (elapsed >= threshold) {
            return label;
        }
    }
    return "thinking";
}
function directionForPhase(phase, currentDirection = "↑") {
    if (phase === "waiting" || phase === "requesting") {
        return "↑";
    }
    if (phase === "executing_tool") {
        return currentDirection;
    }
    return "↓";
}
export class ThinkingStatusComponent extends Text {
    ui;
    startedAt = Date.now();
    activeThinkingStartedAt = undefined;
    estimatedTokens = 0;
    usageTokenCount = 0;
    targetTokenCount = 0;
    displayedTokenCount = 0;
    tokenDirection = "↑";
    phase = "waiting";
    showTokenDetails = false;
    message = undefined;
    timer;
    lastRenderedText = "";
    lastFrameKey = "";
    lastLiveLineWidth = 0;
    lastLiveLine = "";
    liveMarker = `${LIVE_STATUS_MARKER_PREFIX}${nextLiveStatusId++}${LIVE_STATUS_MARKER_SUFFIX}`;
    words = ["Wandering", "Noodling", "Sautéing", "Channelling"];
    spinners = ["✢", "*", "✶", "✻", "✽", "✻", "✶", "*", "✢", "·"];
    constructor(ui, message, options = {}) {
        super("", 0, 0);
        this.ui = ui;
        this.startedAt = options.startedAt ?? this.startedAt;
        this.message = message;
        this.showTokenDetails = options.showTokenDetails ?? false;
        this.words = options.words ?? this.words;
        this.phase = options.phase ?? this.phase;
        this.tokenDirection = directionForPhase(this.phase, this.tokenDirection);
        if (this.phase === "thinking") {
            this.activeThinkingStartedAt = Date.now();
        }
        this.timer = setInterval(() => {
            if (this.updateDisplay({ preferLivePatch: true })) {
                this.ui.requestRender();
            }
        }, options.intervalMs ?? 50);
        this.updateDisplay({ preferLivePatch: true });
    }
    render(width) {
        if (!this.text || this.text.trim() === "") {
            return [];
        }
        return [this.liveMarker + truncateToWidth(this.text, Math.max(1, width)) + TUI.SEGMENT_RESET];
    }
    setMessage(message) {
        this.message = message;
        this.updateDisplay({ preferLivePatch: true });
    }
    setPhase(phase, options = {}) {
        if (this.phase === phase) {
            return;
        }
        this.phase = phase;
        this.lastFrameKey = "";
        this.lastLiveLine = "";
        if (phase === "thinking") {
            this.activeThinkingStartedAt = Date.now();
        }
        this.tokenDirection = directionForPhase(phase, this.tokenDirection);
        if (options.render !== false) {
            this.updateDisplay({ preferLivePatch: true });
        }
    }
    enableTokenDetails() {
        this.showTokenDetails = true;
        this.updateDisplay({ preferLivePatch: true });
    }
    updateFromMessage(message, assistantMessageEvent) {
        this.showTokenDetails = true;
        const type = assistantMessageEvent?.type ?? "";
        const delta = getDelta(assistantMessageEvent);
        if ((type.startsWith("thinking") || type.startsWith("toolcall")) && type.endsWith("_delta") && delta) {
            this.estimatedTokens += estimateTokens(delta);
        }
        if (type.startsWith("thinking")) {
            this.setPhase("thinking", { render: false });
        }
        else if (type.startsWith("toolcall")) {
            this.setPhase("preparing_tool", { render: false });
        }
        const messageHasToolCall = message?.content?.some((content) => content.type === "toolCall") ?? false;
        const usageOutput = getUsageOutput(assistantMessageEvent, message);
        if (usageOutput > 0 && message?.stopReason !== "end_turn" && messageHasToolCall) {
            this.usageTokenCount = Math.max(this.usageTokenCount, usageOutput);
        }
        this.targetTokenCount = Math.max(this.targetTokenCount, this.estimatedTokens);
        this.updateDisplay({ preferLivePatch: true });
    }
    markToolActivity(phase = "executing_tool") {
        if (this.phase === phase) {
            return false;
        }
        this.setPhase(phase, { render: false });
        return this.updateDisplay({ preferLivePatch: true });
    }
    smoothDisplayedTokenCount() {
        if (this.usageTokenCount > this.estimatedTokens) {
            this.estimatedTokens = Math.min(this.usageTokenCount, this.estimatedTokens + 1);
            this.targetTokenCount = Math.max(this.targetTokenCount, this.estimatedTokens);
        }
        const delta = this.targetTokenCount - this.displayedTokenCount;
        if (delta <= 0) {
            return false;
        }
        let step;
        if (delta < 12) {
            step = 1;
        }
        else if (delta < 35) {
            step = 2;
        }
        else if (delta < 120) {
            step = 3;
        }
        else {
            step = 5;
        }
        this.displayedTokenCount = Math.min(this.targetTokenCount, this.displayedTokenCount + step);
        return true;
    }
    renderSpinner(elapsed) {
        const frame = Math.floor(elapsed / 120);
        return color256(frame % 2 === 0 ? 215 : 221, this.spinners[frame % this.spinners.length]);
    }
    renderSpinnerFrame(frame) {
        return color256(frame % 2 === 0 ? 215 : 221, this.spinners[frame % this.spinners.length]);
    }
    renderWord(word, elapsed) {
        const palette = [81, 117, 159, 117];
        return color256(palette[Math.floor(elapsed / 200) % palette.length], word);
    }
    renderWordFrame(word, frame) {
        const palette = [81, 117, 159, 117];
        return color256(palette[frame % palette.length], word);
    }
    renderMuted(text) {
        return color256(247, text);
    }
    renderPhaseLabel(elapsed) {
        if (this.phase === "waiting") {
            return elapsed >= 8000 ? "still waiting for model" : "waiting for model";
        }
        if (this.phase === "requesting") {
            return thinkingLabelForElapsed(elapsed);
        }
        if (this.phase === "thinking") {
            return thinkingLabelForElapsed(elapsed);
        }
        if (this.phase === "preparing_tool") {
            return thinkingLabelForElapsed(elapsed);
        }
        if (this.phase === "executing_tool") {
            return thinkingLabelForElapsed(elapsed);
        }
        if (this.phase === "responding") {
            return "responding";
        }
        return "thinking";
    }
    getPhaseWord(elapsed) {
        const customMessage = this.message && !this.message.startsWith("Working") ? this.message.replace(/\.+$/, "") : undefined;
        if (customMessage) {
            return customMessage;
        }
        return this.words[Math.floor(elapsed / 12000) % this.words.length];
    }
    renderLiveLine() {
        const width = Math.max(1, this.ui.terminal.columns);
        if (this.lastLiveLineWidth === width && this.lastLiveLine) {
            return this.lastLiveLine;
        }
        this.lastLiveLineWidth = width;
        this.lastLiveLine = `${this.liveMarker}${truncateToWidth(this.text, width)}${TUI.SEGMENT_RESET}`;
        return this.lastLiveLine;
    }
    updateDisplay(options = {}) {
        const now = Date.now();
        const elapsed = now - this.startedAt;
        this.smoothDisplayedTokenCount();
        const spinnerFrame = Math.floor(elapsed / 120);
        const wordFrame = Math.floor(elapsed / 200);
        const word = this.getPhaseWord(elapsed);
        const secondsText = formatSeconds(elapsed);
        const phaseLabel = this.renderPhaseLabel(elapsed);
        const tokenText = this.showTokenDetails && this.displayedTokenCount > 0
            ? `${this.tokenDirection} ${Math.round(this.displayedTokenCount).toLocaleString()} tokens`
            : "";
        const nextFrameKey = [
            spinnerFrame,
            wordFrame,
            word,
            secondsText,
            tokenText,
            phaseLabel,
        ].join("|");
        if (nextFrameKey === this.lastFrameKey) {
            return false;
        }
        this.lastFrameKey = nextFrameKey;
        const parts = [formatSeconds(elapsed)];
        if (tokenText) {
            parts.push(tokenText);
        }
        parts.push(phaseLabel);
        const nextText = `${this.renderSpinnerFrame(spinnerFrame)} ${this.renderWordFrame(word, wordFrame)}${this.renderMuted(`… (${parts.join(" · ")})`)}`;
        if (nextText === this.lastRenderedText) {
            return false;
        }
        this.lastLiveLine = "";
        if (options.preferLivePatch) {
            const previousText = this.text;
            this.text = nextText;
            if (this.ui.patchMarkedLine?.(this.liveMarker, this.renderLiveLine())) {
                this.lastRenderedText = nextText;
                this.cachedText = undefined;
                this.cachedWidth = undefined;
                this.cachedLines = undefined;
                this.__piDirtyVersion++;
                this.parentContainer?.markDirty?.();
                return false;
            }
            this.text = previousText;
        }
        this.setText(nextText);
        this.lastRenderedText = nextText;
        return true;
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    dispose() {
        this.stop();
    }
}
//# sourceMappingURL=thinking-status.js.map
