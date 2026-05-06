import { AssistantMessageComponent, BashExecutionComponent, BranchSummaryMessageComponent, CompactionSummaryMessageComponent, CustomMessageComponent, SkillInvocationMessageComponent, UserMessageComponent } from "../tui-renderer/index.mjs";
import { Spacer } from "@mariozechner/pi-tui";
import { parseSkillBlock } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js";
import { runRustShadow } from "../rust-core-shadow/runner.mjs";
import { Text } from "@mariozechner/pi-tui";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

function runTranscriptShadow({ name, op, input, jsValue }) {
    return runRustShadow({
        name,
        commandEnv: "PI_TRANSCRIPT_CORE_COMMAND",
        op,
        input,
        jsValue,
    });
}

export function assistantStopToolResult({ stopReason, retryAttempt = 0, errorMessage }) {
    const result = stopReason === "aborted"
        ? retryAttempt > 0
            ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
            : "Operation aborted"
        : errorMessage || "Error";
    runTranscriptShadow({
        name: "transcript.assistantStopToolResult",
        op: "assistantStopToolResult",
        input: { stopReason, retryAttempt, errorMessage },
        jsValue: result,
    });
    return result;
}

export function compactionStatus({ compactionCount }) {
    const result = compactionCount === 1 ? "Session compacted 1 time" : `Session compacted ${compactionCount} times`;
    runTranscriptShadow({
        name: "transcript.compactionStatus",
        op: "compactionStatus",
        input: { compactionCount },
        jsValue: result,
    });
    return result;
}

export class TranscriptStore {
    adapter;
    sessionStore;
    constructor(adapter, sessionStore) {
        this.adapter = adapter;
        this.sessionStore = sessionStore;
    }
    get ui() {
        return this.adapter.ui;
    }
    lastStatusSpacer = undefined;
    lastStatusText = undefined;
    streamingComponent = undefined;
    streamingMessage = undefined;
    getVisibleTranscriptLineBudget() {
        const enabled = process.env.PI_TUI_VISIBLE_TRANSCRIPT === "1";
        const terminalRows = this.ui?.terminal?.rows ?? 24;
        const multiplier = Number.parseFloat(process.env.PI_TUI_VISIBLE_TRANSCRIPT_MULTIPLIER ?? "4");
        if (!enabled) {
            runTranscriptShadow({
                name: "transcript.visibleTranscriptLineBudget",
                op: "visibleTranscriptLineBudget",
                input: { enabled, terminalRows, multiplier },
                jsValue: null,
            });
            return undefined;
        }
        const rows = Math.max(24, terminalRows);
        const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 4;
        const result = Math.max(rows, Math.ceil(rows * safeMultiplier));
        runTranscriptShadow({
            name: "transcript.visibleTranscriptLineBudget",
            op: "visibleTranscriptLineBudget",
            input: { enabled, terminalRows, multiplier },
            jsValue: result,
        });
        return result;
    }
    setTranscriptTailRendering(active) {
        if (process.env.PI_TUI_VISIBLE_TRANSCRIPT !== "1") {
            this.adapter.setTranscriptTailLines(undefined);
            return;
        }
        const lineBudget = active ? this.getVisibleTranscriptLineBudget() : undefined;
        this.adapter.setTranscriptTailLines(lineBudget);
    }
    getUserMessageText(message) {
        if (message.role !== "user") {
            runTranscriptShadow({
                name: "transcript.userMessageText",
                op: "userMessageText",
                input: message,
                jsValue: "",
            });
            return "";
        }
        const textBlocks = typeof message.content === "string"
            ? [{ type: "text", text: message.content }]
            : message.content.filter((c) => c.type === "text");
        const result = textBlocks.map((c) => c.text).join("");
        runTranscriptShadow({
            name: "transcript.userMessageText",
            op: "userMessageText",
            input: message,
            jsValue: result,
        });
        return result;
    }
    messageHasVisibleText(message) {
        const result = message?.content?.some((content) => content.type === "text" && content.text.trim()) ?? false;
        const shadowInput = Array.isArray(message?.content) ? message : { role: message?.role ?? "", content: [] };
        runTranscriptShadow({
            name: "transcript.messageHasVisibleText",
            op: "messageHasVisibleText",
            input: shadowInput,
            jsValue: result,
        });
        return result;
    }
    messageHasToolCall(message) {
        const result = message?.content?.some((content) => content.type === "toolCall") ?? false;
        const shadowInput = Array.isArray(message?.content) ? message : { role: message?.role ?? "", content: [] };
        runTranscriptShadow({
            name: "transcript.messageHasToolCall",
            op: "messageHasToolCall",
            input: shadowInput,
            jsValue: result,
        });
        return result;
    }
    showStatus(message) {
        const children = this.adapter.getChatChildren();
        const last = children.length > 0 ? children[children.length - 1] : undefined;
        const secondLast = children.length > 1 ? children[children.length - 2] : undefined;
        if (last && secondLast && last === this.lastStatusText && secondLast === this.lastStatusSpacer) {
            this.lastStatusText.setText(theme.fg("dim", message));
            this.adapter.requestRender();
            return;
        }
        const spacer = new Spacer(1);
        const text = new Text(theme.fg("dim", message), 1, 0);
        this.adapter.appendChat(spacer);
        this.adapter.appendChat(text);
        this.lastStatusSpacer = spacer;
        this.lastStatusText = text;
        this.adapter.requestRender();
    }
    showError(errorMessage) {
        this.adapter.appendChat(new Spacer(1));
        this.adapter.appendChat(new Text(theme.fg("error", `Error: ${errorMessage}`), 1, 0));
        this.adapter.requestRender();
    }
    showWarning(warningMessage) {
        this.adapter.appendChat(new Spacer(1));
        this.adapter.appendChat(new Text(theme.fg("warning", `Warning: ${warningMessage}`), 1, 0));
        this.adapter.requestRender();
    }
    hasStreamingAssistant() {
        return !!this.streamingComponent;
    }
    getStreamingMessage() {
        return this.streamingMessage;
    }
    getStreamingComponent() {
        return this.streamingComponent;
    }
    adoptStreamingComponent(component) {
        this.streamingComponent = component;
    }
    adoptStreamingMessage(message) {
        this.streamingMessage = message;
    }
    startStreamingAssistant(message) {
        this.streamingComponent = new AssistantMessageComponent(undefined, this.adapter.getHideThinkingBlock(), this.adapter.getMarkdownTheme(), this.adapter.getHiddenThinkingLabel());
        this.streamingMessage = message;
        this.adapter.appendChat(this.streamingComponent);
        this.streamingComponent.updateContent(this.streamingMessage);
        return this.streamingComponent;
    }
    updateStreamingAssistant(message) {
        if (!this.streamingComponent) {
            return false;
        }
        this.streamingMessage = message;
        this.streamingComponent.updateContent(this.streamingMessage);
        return true;
    }
    setStreamingAssistantErrorMessage(errorMessage) {
        if (!this.streamingMessage) {
            return undefined;
        }
        this.streamingMessage.errorMessage = errorMessage;
        return this.streamingMessage;
    }
    finishStreamingAssistant() {
        const message = this.streamingMessage;
        const component = this.streamingComponent;
        this.streamingComponent = undefined;
        this.streamingMessage = undefined;
        return { message, component };
    }
    removeStreamingAssistant() {
        if (this.streamingComponent) {
            this.adapter.removeChat(this.streamingComponent);
        }
        this.streamingComponent = undefined;
        this.streamingMessage = undefined;
    }
    syncStreamingAssistantDisplayOptions() {
        if (!this.streamingComponent || !this.streamingMessage) {
            return false;
        }
        this.streamingComponent.setHideThinkingBlock(this.adapter.getHideThinkingBlock());
        this.streamingComponent.updateContent(this.streamingMessage);
        this.adapter.appendChat(this.streamingComponent);
        return true;
    }
    renderCurrentSessionState() {
        this.adapter.flushBeforeTranscriptRebuild();
        this.adapter.clearChat();
        this.adapter.clearPending();
        this.adapter.clearCompactionQueueMessages();
        this.removeStreamingAssistant();
        this.adapter.clearStreamSmoothingState();
        this.adapter.clearPendingTools();
        this.renderInitialMessages();
    }
    renderInitialMessages() {
        const context = this.sessionStore.buildSessionContext();
        this.renderSessionContext(context, {
            updateFooter: true,
            populateHistory: true,
        });
        const allEntries = this.sessionStore.getEntries();
        const compactionCount = allEntries.filter((entry) => entry.type === "compaction").length;
        if (compactionCount > 0) {
            this.showStatus(compactionStatus({ compactionCount }));
        }
    }
    rebuildChatFromMessages() {
        this.adapter.clearChat();
        const context = this.sessionStore.buildSessionContext();
        this.renderSessionContext(context);
    }
    addMessageToChat(message, options = {}) {
        switch (message.role) {
            case "bashExecution": {
                const component = new BashExecutionComponent(message.command, this.ui, message.excludeFromContext);
                if (message.output) {
                    component.appendOutput(message.output);
                }
                component.setComplete(message.exitCode, message.cancelled, message.truncated ? { truncated: true } : undefined, message.fullOutputPath);
                this.adapter.appendChat(component);
                break;
            }
            case "custom": {
                if (message.display) {
                    const renderer = this.sessionStore.getMessageRenderer(message.customType);
                    const component = new CustomMessageComponent(message, renderer, this.adapter.getMarkdownTheme());
                    component.setExpanded(this.adapter.getToolOutputExpanded());
                    this.adapter.appendChat(component);
                }
                break;
            }
            case "compactionSummary": {
                this.adapter.appendChat(new Spacer(1));
                const component = new CompactionSummaryMessageComponent(message, this.adapter.getMarkdownTheme());
                component.setExpanded(this.adapter.getToolOutputExpanded());
                this.adapter.appendChat(component);
                break;
            }
            case "branchSummary": {
                this.adapter.appendChat(new Spacer(1));
                const component = new BranchSummaryMessageComponent(message, this.adapter.getMarkdownTheme());
                component.setExpanded(this.adapter.getToolOutputExpanded());
                this.adapter.appendChat(component);
                break;
            }
            case "user": {
                const textContent = this.getUserMessageText(message);
                if (textContent) {
                    if (this.adapter.hasChatChildren()) {
                        this.adapter.appendChat(new Spacer(1));
                    }
                    const skillBlock = parseSkillBlock(textContent);
                    if (skillBlock) {
                        const component = new SkillInvocationMessageComponent(skillBlock, this.adapter.getMarkdownTheme());
                        component.setExpanded(this.adapter.getToolOutputExpanded());
                        this.adapter.appendChat(component);
                        if (skillBlock.userMessage) {
                            const userComponent = new UserMessageComponent(skillBlock.userMessage, this.adapter.getMarkdownTheme());
                            this.adapter.appendChat(userComponent);
                        }
                    }
                    else {
                        const userComponent = new UserMessageComponent(textContent, this.adapter.getMarkdownTheme());
                        this.adapter.appendChat(userComponent);
                    }
                    if (options?.populateHistory) {
                        this.adapter.addEditorHistory(textContent);
                    }
                }
                break;
            }
            case "assistant": {
                const assistantComponent = new AssistantMessageComponent(message, this.adapter.getHideThinkingBlock(), this.adapter.getMarkdownTheme(), this.adapter.getHiddenThinkingLabel());
                this.adapter.appendChat(assistantComponent);
                break;
            }
            case "toolResult": {
                break;
            }
            default: {
                const _exhaustive = message;
            }
        }
    }
    renderSessionContext(sessionContext, options = {}) {
        this.adapter.clearToolFlowState();
        if (options.updateFooter) {
            this.adapter.invalidateFooter();
            this.adapter.updateEditorBorderColor();
        }
        for (const message of sessionContext.messages) {
            if (message.role === "assistant") {
                if (this.messageHasVisibleText(message)) {
                    this.adapter.resetActiveToolFlow();
                }
                this.addMessageToChat(message, options);
                for (const content of message.content) {
                    if (content.type === "toolCall") {
                        const component = this.adapter.createToolExecutionComponent(content.name, content.id, content.arguments);
                        this.adapter.attachToolExecutionComponent(component);
                        if (message.stopReason === "aborted" || message.stopReason === "error") {
                            const errorMessage = assistantStopToolResult({
                                stopReason: message.stopReason,
                                retryAttempt: this.sessionStore.getRetryAttempt(),
                                errorMessage: message.errorMessage,
                            });
                            component.updateResult({ content: [{ type: "text", text: errorMessage }], isError: true });
                            this.adapter.updateToolFlowForToolCall(content.id);
                        }
                        else {
                            this.adapter.setPendingTool(content.id, component);
                        }
                    }
                }
            }
            else if (message.role === "toolResult") {
                const component = this.adapter.getPendingTool(message.toolCallId);
                if (component) {
                    component.updateResult(message);
                    this.adapter.updateToolFlowForToolCall(message.toolCallId);
                    this.adapter.deletePendingTool(message.toolCallId);
                }
            }
            else {
                this.adapter.resetActiveToolFlow();
                this.addMessageToChat(message, options);
            }
        }
        this.adapter.clearPendingTools();
        this.adapter.resetActiveToolFlow();
        this.ui.requestRender();
    }
}
