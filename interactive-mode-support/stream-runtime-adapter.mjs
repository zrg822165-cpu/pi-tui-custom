import { performance } from "node:perf_hooks";
import * as streamDiagnostics from "./stream-diagnostics.mjs";
import * as streamSmoothingPolicy from "./stream-smoothing-policy.mjs";

export function getStreamingTextStats(message) {
    return streamDiagnostics.getStreamingTextStats(message);
}

export function recordStreamTiming(entry) {
    streamDiagnostics.recordStreamTiming(entry);
}

export function getStreamSmoothingMode() {
    return streamSmoothingPolicy.STREAM_SMOOTHING_MODE;
}

export function isStreamSmoothingEnabled() {
    return getStreamSmoothingMode() !== "off";
}

export function getStreamSmoothingRejectReason(host, event, eventGapMs = 0) {
    return streamSmoothingPolicy.getStreamSmoothingRejectReason({
        mode: host.getStreamSmoothingMode(),
        event,
        eventGapMs,
        targetMessage: host.streamSmoothingTargetMessage,
        streamingMessage: host.streamingMessage,
    });
}

export function getStreamSmoothingDelay() {
    return streamSmoothingPolicy.STREAM_SMOOTHING_INTERVAL_MS;
}

export function getStreamSmoothingStep(host, backlog, queuedDelayMs) {
    return streamSmoothingPolicy.getStreamSmoothingStep({
        mode: host.getStreamSmoothingMode(),
        backlog,
        queuedDelayMs,
        lastEventGapMs: host.streamSmoothingLastEventGapMs,
    });
}

export function canSmoothStreamingEvent(host, event) {
    return host.getStreamSmoothingRejectReason(event) === "";
}

export function getSmoothTextContentInfo(message) {
    return streamSmoothingPolicy.getSmoothTextContentInfo(message);
}

export function getSingleTextContent(message) {
    return streamSmoothingPolicy.getSingleTextContent(message);
}

export function cloneStreamingMessageWithText(message, text) {
    return streamSmoothingPolicy.cloneStreamingMessageWithText(message, text);
}

export function clearStreamSmoothingState(host) {
    if (host.streamSmoothingTimer) {
        clearTimeout(host.streamSmoothingTimer);
        host.streamSmoothingTimer = undefined;
    }
    host.streamSmoothingTargetMessage = undefined;
    host.streamSmoothingTargetEvent = undefined;
    host.streamSmoothingQueuedAt = 0;
    host.streamSmoothingDisplayedLength = 0;
    host.lastStreamSmoothingFlushAt = 0;
    host.streamSmoothingLastEventGapMs = 0;
}

export function queueSmoothedStreamingUpdate(host, event, now, eventGapMs = 0) {
    const targetText = host.getSingleTextContent(event.message);
    const currentText = host.getSingleTextContent(host.streamingMessage);
    if (!host.streamSmoothingTargetMessage) {
        host.streamSmoothingDisplayedLength = Math.min(currentText.length, targetText.length);
    }
    host.streamSmoothingTargetMessage = event.message;
    host.streamSmoothingTargetEvent = event;
    host.streamSmoothingQueuedAt = now;
    host.streamSmoothingLastEventGapMs = Math.max(host.streamSmoothingLastEventGapMs, eventGapMs);
    if (host.streamSmoothingTimer) {
        return;
    }
    host.streamSmoothingTimer = setTimeout(() => {
        host.streamSmoothingTimer = undefined;
        host.flushStreamSmoothing(false);
    }, host.getStreamSmoothingDelay());
}

export function flushStreamSmoothing(host, immediate = false) {
    if (host.streamSmoothingTimer) {
        clearTimeout(host.streamSmoothingTimer);
        host.streamSmoothingTimer = undefined;
    }
    const targetMessage = host.streamSmoothingTargetMessage;
    const event = host.streamSmoothingTargetEvent;
    if (!targetMessage || !event) {
        return;
    }
    if (!host.streamingComponent) {
        host.clearStreamSmoothingState();
        return;
    }
    const targetText = host.getSingleTextContent(targetMessage);
    const targetLength = targetText.length;
    if (targetLength <= host.streamSmoothingDisplayedLength || immediate) {
        host.streamSmoothingDisplayedLength = targetLength;
    }
    else {
        const backlog = targetLength - host.streamSmoothingDisplayedLength;
        const queuedDelayMs = performance.now() - host.streamSmoothingQueuedAt;
        const step = host.getStreamSmoothingStep(backlog, queuedDelayMs);
        host.streamSmoothingDisplayedLength += step;
    }
    const displayText = targetText.slice(0, host.streamSmoothingDisplayedLength);
    if (displayText === host.getSingleTextContent(host.streamingMessage)) {
        if (host.streamSmoothingDisplayedLength >= targetLength) {
            host.streamSmoothingTargetMessage = undefined;
            host.streamSmoothingTargetEvent = undefined;
            host.streamSmoothingLastEventGapMs = 0;
            return;
        }
        host.streamSmoothingTimer = setTimeout(() => {
            host.streamSmoothingTimer = undefined;
            host.flushStreamSmoothing(false);
        }, host.getStreamSmoothingDelay());
        return;
    }
    const displayMessage = host.cloneStreamingMessageWithText(targetMessage, displayText);
    const flushStartedAt = performance.now();
    const flushGapMs = host.lastStreamSmoothingFlushAt > 0 ? flushStartedAt - host.lastStreamSmoothingFlushAt : 0;
    host.streamingMessage = displayMessage;
    host.streamingComponent.updateContent(displayMessage);
    if (displayText.trim()) {
        host.resetActiveToolFlow();
        if (host.loadingAnimation) {
            host.loadingAnimation.stop();
            host.loadingAnimation = undefined;
        }
        if (!host.thinkingStatus) {
            host.rendererHost.clearStatus();
        }
        else {
            host.thinkingStatus.markToolActivity("responding");
        }
    }
    host.ui.requestRender();
    host.lastStreamSmoothingFlushAt = flushStartedAt;
    host.lastStreamingFlushAt = flushStartedAt;
    host.recordStreamTiming({
        kind: "streamSmoothFlush",
        flushGapMs,
        queuedDelayMs: host.streamSmoothingQueuedAt > 0 ? flushStartedAt - host.streamSmoothingQueuedAt : 0,
        displayedLength: host.streamSmoothingDisplayedLength,
        targetLength,
        totalMs: performance.now() - flushStartedAt,
        ...host.getStreamingTextStats(displayMessage),
    });
    if (host.streamSmoothingDisplayedLength >= targetLength) {
        host.streamSmoothingTargetMessage = undefined;
        host.streamSmoothingTargetEvent = undefined;
        host.streamSmoothingLastEventGapMs = 0;
        return;
    }
    host.streamSmoothingTimer = setTimeout(() => {
        host.streamSmoothingTimer = undefined;
        host.flushStreamSmoothing(false);
    }, host.getStreamSmoothingDelay());
}

export function queueStreamingMessageUpdate(host, event) {
    if (!host.streamingComponent || event.message.role !== "assistant") {
        return;
    }
    const now = performance.now();
    const eventGapMs = host.lastStreamingEventAt > 0 ? now - host.lastStreamingEventAt : 0;
    host.lastStreamingEventAt = now;
    const stats = host.getStreamingTextStats(event.message);
    const smoothRejectReason = host.getStreamSmoothingRejectReason(event, eventGapMs);
    host.recordStreamTiming({
        kind: "streamEvent",
        eventGapMs,
        assistantEventType: event.assistantMessageEvent?.type ?? "",
        deltaLength: typeof event.assistantMessageEvent?.delta === "string" ? event.assistantMessageEvent.delta.length : 0,
        smoothEligible: smoothRejectReason === "",
        smoothRejectReason,
        ...stats,
        timerPending: host.streamingUpdateTimer !== undefined,
    });
    if (smoothRejectReason === "") {
        if (host.streamingUpdateTimer || host.streamingUpdateMessage || host.streamingUpdateEvent) {
            host.flushStreamingMessageUpdate();
        }
        host.queueSmoothedStreamingUpdate(event, now, eventGapMs);
        return;
    }
    host.flushStreamSmoothing(true);
    host.streamingMessage = event.message;
    host.streamingUpdateMessage = event.message;
    host.streamingUpdateEvent = event;
    host.streamingUpdateQueuedAt = now;
    if (host.streamingUpdateTimer) {
        return;
    }
    host.streamingUpdateTimer = setTimeout(() => {
        host.streamingUpdateTimer = undefined;
        host.flushStreamingMessageUpdate();
    }, 16);
}

export function flushStreamingMessageUpdate(host) {
    host.flushStreamSmoothing(true);
    if (host.streamingUpdateTimer) {
        clearTimeout(host.streamingUpdateTimer);
        host.streamingUpdateTimer = undefined;
    }
    const message = host.streamingUpdateMessage;
    const event = host.streamingUpdateEvent;
    host.streamingUpdateMessage = undefined;
    host.streamingUpdateEvent = undefined;
    if (!message || !event || !host.streamingComponent || message.role !== "assistant") {
        return;
    }
    const flushStartedAt = performance.now();
    const flushGapMs = host.lastStreamingFlushAt > 0 ? flushStartedAt - host.lastStreamingFlushAt : 0;
    const queuedDelayMs = host.streamingUpdateQueuedAt > 0 ? flushStartedAt - host.streamingUpdateQueuedAt : 0;
    host.streamingMessage = message;
    host.streamingComponent.updateContent(host.streamingMessage);
    const hasToolCall = host.messageHasToolCall(host.streamingMessage);
    const assistantEventType = event.assistantMessageEvent?.type ?? "";
    const hadStatus = !!host.thinkingStatus || !!host.loadingAnimation;
    let needsRender = !hasToolCall && host.messageHasVisibleText(host.streamingMessage);
    if (!hasToolCall && host.messageHasVisibleText(host.streamingMessage)) {
        host.resetActiveToolFlow();
        if (host.loadingAnimation) {
            host.loadingAnimation.stop();
            host.loadingAnimation = undefined;
        }
        if (!host.thinkingStatus) {
            host.rendererHost.clearStatus();
        }
        else {
            host.thinkingStatus.markToolActivity("responding");
        }
    }
    else if (hasToolCall || (host.shouldShowThinkingStatus() && assistantEventType.startsWith("thinking")) || assistantEventType.startsWith("toolcall")) {
        const status = host.ensureToolThinkingStatus();
        if (!host.shouldShowThinkingStatus() && assistantEventType.startsWith("thinking")) {
            status.markToolActivity(hasToolCall ? "preparing_tool" : "responding");
        }
        else {
            status.updateFromMessage(host.streamingMessage, event.assistantMessageEvent);
        }
    }
    for (const content of host.streamingMessage.content) {
        if (content.type === "toolCall") {
            if (!host.hasPendingTool(content.id)) {
                const component = host.createToolExecutionComponent(content.name, content.id, content.arguments);
                host.setPendingTool(content.id, component);
                if (host.attachToolExecutionComponentIfReady(component)) {
                    needsRender = true;
                }
            }
            else {
                const component = host.getPendingTool(content.id);
                if (component) {
                    const visibleArgsChanged = component.updateArgs(content.arguments);
                    if (host.attachToolExecutionComponentIfReady(component)) {
                        needsRender = true;
                    }
                    if (visibleArgsChanged && host.hasToolFlow(content.id)) {
                        host.updateToolFlowForToolCall(content.id);
                        needsRender = true;
                    }
                    host.ensureToolThinkingStatus().markToolActivity("preparing_tool");
                }
            }
        }
    }
    if ((hasToolCall && !hadStatus) || needsRender) {
        host.ui.requestRender();
    }
    host.lastStreamingFlushAt = flushStartedAt;
    host.recordStreamTiming({
        kind: "streamFlush",
        flushGapMs,
        queuedDelayMs,
        assistantEventType,
        totalMs: performance.now() - flushStartedAt,
        ...host.getStreamingTextStats(host.streamingMessage),
    });
}

export function queueToolExecutionUpdate(host, event) {
    host.pendingToolUpdates.set(event.toolCallId, event);
    const component = host.getPendingTool(event.toolCallId);
    if (component) {
        host.ensureToolThinkingStatus().markToolActivity("executing_tool");
    }
    if (host.toolUpdateTimer) {
        return;
    }
    host.toolUpdateTimer = setTimeout(() => {
        host.toolUpdateTimer = undefined;
        host.flushToolExecutionUpdates();
    }, 16);
}

export function flushToolExecutionUpdates(host) {
    if (host.toolUpdateTimer) {
        clearTimeout(host.toolUpdateTimer);
        host.toolUpdateTimer = undefined;
    }
    if (host.pendingToolUpdates.size === 0) {
        return;
    }
    const updates = [...host.pendingToolUpdates.values()];
    host.pendingToolUpdates.clear();
    let didUpdate = false;
    for (const event of updates) {
        const component = host.getPendingTool(event.toolCallId);
        if (!component) {
            continue;
        }
        component.updateResult({ ...event.partialResult, isError: false }, true);
        host.updateToolFlowForToolCall(event.toolCallId);
        didUpdate = true;
    }
    if (didUpdate) {
        host.ui.requestRender();
    }
}
