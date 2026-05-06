export const STREAM_SMOOTHING_ENV = (process.env.PI_TUI_STREAM_SMOOTHING ?? "force").toLowerCase();
export const STREAM_SMOOTHING_MODE = STREAM_SMOOTHING_ENV === "0" ||
    STREAM_SMOOTHING_ENV === "false" ||
    STREAM_SMOOTHING_ENV === "off"
    ? "off"
    : STREAM_SMOOTHING_ENV === "1" ||
        STREAM_SMOOTHING_ENV === "true" ||
        STREAM_SMOOTHING_ENV === "on" ||
        STREAM_SMOOTHING_ENV === "force"
        ? "force"
        : "auto";
const STREAM_SMOOTHING_INTERVAL_RAW = Number.parseFloat(process.env.PI_TUI_STREAM_SMOOTHING_INTERVAL ?? "16");
export const STREAM_SMOOTHING_INTERVAL_MS = Number.isFinite(STREAM_SMOOTHING_INTERVAL_RAW) && STREAM_SMOOTHING_INTERVAL_RAW > 0
    ? Math.max(8, Math.min(50, STREAM_SMOOTHING_INTERVAL_RAW))
    : 16;

export function getStreamSmoothingRejectReason({ mode, event, eventGapMs = 0, targetMessage, streamingMessage }) {
    if (mode === "off") {
        return "disabled";
    }
    if (event.assistantMessageEvent?.type !== "text_delta") {
        return `event:${event.assistantMessageEvent?.type ?? ""}`;
    }
    if (event.message.role !== "assistant") {
        return `role:${event.message.role}`;
    }
    const content = event.message?.content ?? [];
    let textBlocks = 0;
    for (const block of content) {
        if (block.type === "toolCall") {
            return "toolCall";
        }
        if (block.type !== "text" && block.type !== "thinking") {
            return `block:${block.type}`;
        }
        if (block.type === "text") {
            textBlocks++;
        }
    }
    if (textBlocks !== 1) {
        return `textBlocks:${textBlocks}`;
    }
    if (mode === "force" || targetMessage) {
        return "";
    }
    const targetText = getSingleTextContent(event.message);
    const currentText = getSingleTextContent(streamingMessage);
    const backlog = targetText.length - currentText.length;
    const deltaLength = typeof event.assistantMessageEvent?.delta === "string" ? event.assistantMessageEvent.delta.length : 0;
    if (eventGapMs >= 120 || backlog >= 16 || (eventGapMs >= 48 && deltaLength >= 3)) {
        return "";
    }
    return "steady";
}

export function getStreamSmoothingStep({ mode, backlog, queuedDelayMs, lastEventGapMs }) {
    let step = Math.max(1, Math.ceil(backlog / 4));
    if (backlog > 96) {
        step = Math.max(step, Math.ceil(backlog * 0.35));
    }
    if (queuedDelayMs > 180) {
        step = Math.max(step, Math.ceil(backlog * 0.8));
    }
    else if (queuedDelayMs > 90) {
        step = Math.max(step, Math.ceil(backlog * 0.55));
    }
    if (lastEventGapMs > 600 && backlog > 24) {
        step = Math.min(step, Math.ceil(backlog * 0.45));
    }
    else if (lastEventGapMs > 180 && backlog > 12) {
        step = Math.min(step, Math.ceil(backlog * 0.55));
    }
    if (mode === "auto") {
        step = Math.max(step, Math.ceil(backlog / 3));
    }
    if (backlog <= 8) {
        step = Math.min(step, Math.max(1, Math.ceil(backlog / 2)));
    }
    const minStep = mode === "force" ? 2 : 3;
    return Math.min(backlog, Math.max(step, minStep));
}

export function getSmoothTextContentInfo(message) {
    let textIndex = -1;
    let text = "";
    const content = message?.content ?? [];
    for (let i = 0; i < content.length; i++) {
        const block = content[i];
        if (block.type === "toolCall") {
            return undefined;
        }
        if (block.type !== "text" && block.type !== "thinking") {
            return undefined;
        }
        if (block.type === "text") {
            if (textIndex !== -1) {
                return undefined;
            }
            textIndex = i;
            text = block.text ?? "";
        }
    }
    return textIndex === -1 ? undefined : { index: textIndex, text };
}

export function getSingleTextContent(message) {
    return getSmoothTextContentInfo(message)?.text ?? "";
}

export function cloneStreamingMessageWithText(message, text) {
    const info = getSmoothTextContentInfo(message);
    if (!info) {
        return message;
    }
    const content = message.content[info.index];
    const nextContent = [...message.content];
    nextContent[info.index] = { ...content, text };
    return {
        ...message,
        content: nextContent,
    };
}

