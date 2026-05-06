import { Loader, Spacer, Text } from "@mariozechner/pi-tui";
import { keyText } from "../tui-renderer/index.mjs";
import { createCompactionSummaryMessage } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/messages.js";
import { CountdownTimer } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/countdown-timer.js";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export function clearEditor(host) {
    host.editor.setText("");
    host.ui.requestRender();
}

export function showError(host, errorMessage) {
    host.transcriptStore.showError(errorMessage);
}

export function shouldShowTerminalProgress(host) {
    return host.settingsManager.getShowTerminalProgress();
}

export function hasRetryEscapeHandler(host) {
    return !!host.retryEscapeHandler;
}

export function hasRetryCountdown(host) {
    return !!host.retryCountdown;
}

export function hasRetryLoader(host) {
    return !!host.retryLoader;
}

export function shouldStartWorkingLoader(host) {
    return host.workingVisible && !host.loadingAnimation;
}

export function hasWorkingLoader(host) {
    return !!host.loadingAnimation;
}

export function hasCompactionEscapeHandler(host) {
    return !!host.autoCompactionEscapeHandler;
}

export function hasCompactionLoader(host) {
    return !!host.autoCompactionLoader;
}

export function hasStreamingAssistant(host) {
    return !!host.streamingComponent;
}

export function hasPendingTool(host, toolCallId) {
    return !!host.getPendingTool(toolCallId);
}

export function getRetryAttempt(host) {
    return host.sessionStore.getRetryAttempt();
}

export function invalidateFooter(host) {
    host.footer.invalidate();
}

export function requestRender(host) {
    host.ui.requestRender();
}

export function setAssistantActivity(host, active) {
    host.defaultEditor.setAssistantActivity(active);
}

export function setTerminalProgress(host, active) {
    host.ui.terminal.setProgress(active);
}

export function clearStatusLine(host) {
    host.rendererHost.clearStatus();
}

export function startWorkingLoaderIfVisible(host) {
    if (host.workingVisible && !host.loadingAnimation) {
        host.loadingAnimation = host.createWorkingLoader();
        host.rendererHost.setStatus(host.loadingAnimation);
    }
}

export function stopWorkingLoader(host) {
    if (host.loadingAnimation) {
        host.loadingAnimation.stop();
        host.loadingAnimation = undefined;
        host.rendererHost.clearStatus();
    }
}

export function removeStreamingAssistant(host) {
    host.transcriptStore.removeStreamingAssistant();
}

export function startStreamingAssistant(host, message) {
    host.transcriptStore.startStreamingAssistant(message);
}

export function queueAssistantStreamUpdate(host, event) {
    if (host.streamingComponent && event?.message?.role === "assistant") {
        host.queueStreamingMessageUpdate(event);
    }
}

export function setStreamingAssistantMessage(host, message) {
    host.streamingMessage = message;
}

export function setStreamingAbortError(host, errorMessage) {
    if (host.streamingMessage) {
        host.streamingMessage.errorMessage = errorMessage;
    }
}

export function updateStreamingAssistantContent(host) {
    if (host.streamingComponent && host.streamingMessage) {
        host.streamingComponent.updateContent(host.streamingMessage);
    }
}

export function finishStreamingAssistant(host) {
    host.transcriptStore.finishStreamingAssistant();
}

export function createPendingToolIfMissing(host, toolCallId, toolName, args) {
    let component = host.getPendingTool(toolCallId);
    if (!component) {
        component = host.createToolExecutionComponent(toolName, toolCallId, args);
        host.setPendingTool(toolCallId, component);
    }
}

export function attachPendingToolIfReady(host, toolCallId) {
    const component = host.getPendingTool(toolCallId);
    if (component) {
        host.attachToolExecutionComponentIfReady(component, true);
    }
}

export function markPendingToolStarted(host, toolCallId) {
    const component = host.getPendingTool(toolCallId);
    if (component) {
        component.markExecutionStarted();
    }
}

export function updatePendingToolResult(host, toolCallId, result, isError) {
    const component = host.getPendingTool(toolCallId);
    if (component) {
        component.updateResult({ ...result, isError });
    }
}

export function queuePendingToolUpdate(host, toolCallId, event) {
    const component = host.getPendingTool(toolCallId);
    if (component) {
        host.queueToolExecutionUpdate(event);
    }
}

export function markAllPendingToolsError(host, errorMessage) {
    for (const [, component] of host.getPendingToolEntries()) {
        host.attachToolExecutionComponentIfReady(component, true);
        component.updateResult({
            content: [{ type: "text", text: errorMessage }],
            isError: true,
        });
        host.updateToolFlowForToolCall(component.toolCallId);
    }
}

export function finalizePendingToolArgs(host) {
    for (const [, component] of host.getPendingToolEntries()) {
        host.attachToolExecutionComponentIfReady(component, true);
        component.setArgsComplete();
        host.updateToolFlowForToolCall(component.toolCallId);
    }
}

export function markToolThinkingActivity(host, activity) {
    host.ensureToolThinkingStatus().markToolActivity(activity);
}

export function setToolThinkingPhase(host, phase) {
    host.ensureToolThinkingStatus().setPhase(phase);
}

export function stopToolThinkingIfVisibleText(host) {
    if (host.streamingMessage?.stopReason === "end_turn" && host.messageHasVisibleText(host.streamingMessage)) {
        host.stopToolThinkingStatus();
    }
}

export function saveCompactionEscapeHandler(host) {
    host.autoCompactionEscapeHandler = host.defaultEditor.onEscape;
}

export function setCompactionAbortHandler(host) {
    host.defaultEditor.onEscape = () => {
        host.sessionStore.abortCompaction();
    };
}

export function restoreCompactionEscapeHandler(host) {
    if (host.autoCompactionEscapeHandler) {
        host.defaultEditor.onEscape = host.autoCompactionEscapeHandler;
        host.autoCompactionEscapeHandler = undefined;
    }
}

export function showCompactionLoader(host, reason) {
    const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
    const label = reason === "manual"
        ? `Compacting context... ${cancelHint}`
        : `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
    host.autoCompactionLoader = new Loader(host.ui, (spinner) => theme.fg("accent", spinner), (text) => theme.fg("muted", text), label);
    host.rendererHost.appendStatus(host.autoCompactionLoader);
}

export function stopCompactionLoader(host) {
    if (host.autoCompactionLoader) {
        host.autoCompactionLoader.stop();
        host.autoCompactionLoader = undefined;
        host.rendererHost.clearStatus();
    }
}

export function addCompactionSummary(host, summary, tokensBefore) {
    host.rendererHost.clearChat();
    host.rebuildChatFromMessages();
    host.addMessageToChat(createCompactionSummaryMessage(summary, tokensBefore, new Date().toISOString()));
}

export function addCompactionError(host, errorMessage) {
    host.rendererHost.appendChat(new Spacer(1));
    host.rendererHost.appendChat(new Text(theme.fg("error", errorMessage), 1, 0));
}

export function saveRetryEscapeHandler(host) {
    host.retryEscapeHandler = host.defaultEditor.onEscape;
}

export function setRetryAbortHandler(host) {
    host.defaultEditor.onEscape = () => {
        host.sessionStore.abortRetry();
    };
}

export function restoreRetryEscapeHandler(host) {
    if (host.retryEscapeHandler) {
        host.defaultEditor.onEscape = host.retryEscapeHandler;
        host.retryEscapeHandler = undefined;
    }
}

export function disposeRetryCountdown(host) {
    if (host.retryCountdown) {
        host.retryCountdown.dispose();
        host.retryCountdown = undefined;
    }
}

export function disposeExistingRetryCountdown(host) {
    host.retryCountdown?.dispose();
}

export function stopRetryLoader(host, options = {}) {
    if (host.retryLoader) {
        host.retryLoader.stop();
        host.retryLoader = undefined;
        if (options.clearStatus) {
            host.rendererHost.clearStatus();
        }
    }
}

export function showRetryLoader(host, { attempt, maxAttempts, delayMs }) {
    const retryMessage = (seconds) => `Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
    host.retryLoader = new Loader(host.ui, (spinner) => theme.fg("warning", spinner), (text) => theme.fg("muted", text), retryMessage(Math.ceil(delayMs / 1000)));
    host.retryCountdown = new CountdownTimer(delayMs, host.ui, (seconds) => {
        host.retryLoader?.setMessage(retryMessage(seconds));
    }, () => {
        host.retryCountdown = undefined;
    });
    host.rendererHost.appendStatus(host.retryLoader);
}

export function showWarning(host, warningMessage) {
    host.transcriptStore.showWarning(warningMessage);
}

export function showNewVersionNotification(host, newVersion) {
    host.noticeStore.showNewVersionNotification(newVersion);
}

export function showPackageUpdateNotification(host, packages) {
    host.noticeStore.showPackageUpdateNotification(packages);
}

export function getAllQueuedMessages(host) {
    return host.queueStore.getAllQueuedMessages();
}

export function clearAllQueues(host) {
    return host.queueStore.clearAllQueues();
}

export function updatePendingMessagesDisplay(host) {
    host.queueStore.updatePendingMessagesDisplay();
}

export function restoreQueuedMessagesToEditor(host, options) {
    return host.queueStore.restoreQueuedMessagesToEditor(options);
}

export function queueCompactionMessage(host, text, mode) {
    host.queueStore.queueCompactionMessage(text, mode);
}

export function getUserMessageText(host, message) {
    return host.transcriptStore.getUserMessageText(message);
}

export function showStatus(host, message) {
    host.transcriptStore.showStatus(message);
}

export function addMessageToChat(host, message, options) {
    host.transcriptStore.addMessageToChat(message, options);
}

export function renderSessionContext(host, sessionContext, options = {}) {
    host.transcriptStore.renderSessionContext(sessionContext, options);
}

export function renderInitialMessages(host) {
    host.transcriptStore.renderInitialMessages();
}

export function getUserInput(host) {
    return new Promise((resolve) => {
        host.onInputCallback = (text) => {
            host.onInputCallback = undefined;
            resolve(text);
        };
    });
}

export function rebuildChatFromMessages(host) {
    host.transcriptStore.rebuildChatFromMessages();
}

export function isExtensionCommand(host, text) {
    if (!text.startsWith("/")) {
        return false;
    }
    const extensionRunner = host.sessionStore.getExtensionRunner();
    const spaceIndex = text.indexOf(" ");
    const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
    return !!extensionRunner.getCommand(commandName);
}

export function flushCompactionQueue(host, options) {
    return host.queueStore.flushCompactionQueue(options);
}

export function flushPendingBashComponents(host) {
    host.bashStore.flushPendingBashComponents();
}

export function getBashOutputFlushMs(host) {
    return host.bashStore.getBashOutputFlushMs();
}

export function queueBashOutput(host, chunk) {
    host.bashStore.queueBashOutput(chunk);
}

export function flushBashOutput(host) {
    return host.bashStore.flushBashOutput();
}

export function handleBashCommand(host, command, excludeFromContext = false) {
    return host.bashStore.handleBashCommand(command, excludeFromContext);
}

export function getVisibleTranscriptLineBudget(host) {
    return host.transcriptStore.getVisibleTranscriptLineBudget();
}

export function setTranscriptTailRendering(host, active) {
    host.transcriptStore.setTranscriptTailRendering(active);
}

export function renderCurrentSessionState(host) {
    host.transcriptStore.renderCurrentSessionState();
}

export function messageHasVisibleText(host, message) {
    return host.transcriptStore.messageHasVisibleText(message);
}

export function messageHasToolCall(host, message) {
    return host.transcriptStore.messageHasToolCall(message);
}

export function getStartupExpansionState(host) {
    return host.toolFlowStore.getStartupExpansionState();
}

export function createToolExecutionComponent(host, toolName, toolCallId, args) {
    return host.toolFlowStore.createToolExecutionComponent(toolName, toolCallId, args);
}

export function attachToolExecutionComponent(host, component) {
    host.toolFlowStore.attachToolExecutionComponent(component);
}

export function shouldAttachToolExecutionComponent(host, component, force = false) {
    return host.toolFlowStore.shouldAttachToolExecutionComponent(component, force);
}

export function attachToolExecutionComponentIfReady(host, component, force = false) {
    return host.toolFlowStore.attachToolExecutionComponentIfReady(component, force);
}

export function updateToolFlowForToolCall(host, toolCallId) {
    host.toolFlowStore.updateToolFlowForToolCall(toolCallId);
}

export function resetActiveToolFlow(host) {
    host.toolFlowStore.resetActiveToolFlow();
}

export function getPendingTool(host, toolCallId) {
    return host.toolFlowStore.getPendingTool(toolCallId);
}

export function setPendingTool(host, toolCallId, component) {
    host.toolFlowStore.setPendingTool(toolCallId, component);
}

export function hasPendingToolInFlow(host, toolCallId) {
    return host.toolFlowStore.hasPendingTool(toolCallId);
}

export function deletePendingTool(host, toolCallId) {
    host.toolFlowStore.deletePendingTool(toolCallId);
}

export function getPendingToolEntries(host) {
    return host.toolFlowStore.getPendingToolEntries();
}

export function clearPendingTools(host) {
    host.toolFlowStore.clearPendingTools();
}

export function clearToolFlowState(host) {
    host.toolFlowStore.clearAll();
}

export function hasToolFlow(host, toolCallId) {
    return host.toolFlowStore.hasToolFlow(toolCallId);
}

export function getWorkingLoaderMessage(host) {
    return host.uiStateStore.getWorkingLoaderMessage();
}

export function createWorkingLoader(host) {
    return host.uiStateStore.createWorkingLoader();
}

export function createResponseLoader(host) {
    return host.uiStateStore.createResponseLoader();
}

export function shouldShowThinkingStatus(host) {
    return host.uiStateStore.shouldShowThinkingStatus();
}

export function ensureResponseLoader(host) {
    host.uiStateStore.ensureResponseLoader();
}

export function ensureToolThinkingStatus(host) {
    return host.uiStateStore.ensureToolThinkingStatus();
}

export function stopToolThinkingStatus(host) {
    host.uiStateStore.stopToolThinkingStatus();
}

export function stopUiStateWorkingLoader(host) {
    host.uiStateStore.stopWorkingLoader();
}

export function setWorkingVisible(host, visible) {
    host.uiStateStore.setWorkingVisible(visible);
}

export function setWorkingIndicator(host, options) {
    host.uiStateStore.setWorkingIndicator(options);
}

export function setHiddenThinkingLabel(host, label) {
    host.uiStateStore.setHiddenThinkingLabel(label);
}

export function getStreamingComponent(host) {
    return host.transcriptStore?.getStreamingComponent();
}

export function setStreamingComponent(host, component) {
    if (component === undefined) {
        host.transcriptStore?.finishStreamingAssistant();
    }
    else if (host.transcriptStore) {
        host.transcriptStore.adoptStreamingComponent(component);
    }
}

export function getStreamingMessage(host) {
    return host.transcriptStore?.getStreamingMessage();
}

export function setStreamingMessage(host, message) {
    if (host.transcriptStore) {
        host.transcriptStore.adoptStreamingMessage(message);
    }
}
