import { ToolExecutionComponent, ToolFlowSummaryComponent, getToolDisplayTarget } from "../tui-renderer/index.mjs";
import { runRustShadow } from "../rust-core-shadow/runner.mjs";

function runUiShadow({ name, op, input, jsValue }) {
    return runRustShadow({
        name,
        commandEnv: "PI_UI_CORE_COMMAND",
        op,
        input,
        jsValue,
    });
}

export class ToolFlowStore {
    host;
    pendingTools = new Map();
    toolFlowByToolCallId = new Map();
    activeToolFlow = undefined;
    constructor(host) {
        this.host = host;
    }
    get ui() {
        return this.host.ui;
    }
    get rendererHost() {
        return this.host.rendererHost;
    }
    getStartupExpansionState() {
        const result = this.host.options.verbose || this.host.toolOutputExpanded;
        runUiShadow({
            name: "ui.startupExpansion",
            op: "startupExpansion",
            input: { verbose: this.host.options.verbose, toolOutputExpanded: this.host.toolOutputExpanded },
            jsValue: result,
        });
        return result;
    }
    createToolExecutionComponent(toolName, toolCallId, args) {
        const component = new ToolExecutionComponent(toolName, toolCallId, args, {
            showImages: this.host.settingsManager.getShowImages(),
            imageWidthCells: this.host.settingsManager.getImageWidthCells(),
        }, this.host.getRegisteredToolDefinition(toolName), this.ui, this.host.sessionStore.getCwd());
        component.setExpanded(this.host.toolOutputExpanded);
        return component;
    }
    attachToolExecutionComponent(component) {
        if (this.toolFlowByToolCallId.has(component.toolCallId)) {
            return;
        }
        if (!this.activeToolFlow || !this.activeToolFlow.canAccept(component.toolName)) {
            this.activeToolFlow = new ToolFlowSummaryComponent();
            this.activeToolFlow.setExpanded(this.host.toolOutputExpanded);
            this.rendererHost.appendChat(this.activeToolFlow);
        }
        this.activeToolFlow.addTool(component);
        this.toolFlowByToolCallId.set(component.toolCallId, this.activeToolFlow);
    }
    shouldAttachToolExecutionComponent(component, force = false) {
        const alreadyAttached = this.toolFlowByToolCallId.has(component.toolCallId);
        const displayTarget = getToolDisplayTarget(component.toolName, component.args);
        const result = alreadyAttached
            ? false
            : force || component.expanded || component.executionStarted || component.argsComplete || !!component.result
                ? true
                : displayTarget !== "";
        runUiShadow({
            name: "ui.toolShouldAttach",
            op: "toolShouldAttach",
            input: {
                alreadyAttached,
                force,
                expanded: component.expanded,
                executionStarted: component.executionStarted,
                argsComplete: component.argsComplete,
                hasResult: !!component.result,
                displayTarget,
            },
            jsValue: result,
        });
        return result;
    }
    attachToolExecutionComponentIfReady(component, force = false) {
        if (!this.shouldAttachToolExecutionComponent(component, force)) {
            return false;
        }
        this.attachToolExecutionComponent(component);
        return true;
    }
    updateToolFlowForToolCall(toolCallId) {
        this.toolFlowByToolCallId.get(toolCallId)?.updateDisplay();
    }
    resetActiveToolFlow() {
        this.activeToolFlow = undefined;
    }
    getPendingTool(toolCallId) {
        return this.pendingTools.get(toolCallId);
    }
    setPendingTool(toolCallId, component) {
        this.pendingTools.set(toolCallId, component);
    }
    hasPendingTool(toolCallId) {
        return this.pendingTools.has(toolCallId);
    }
    deletePendingTool(toolCallId) {
        this.pendingTools.delete(toolCallId);
    }
    getPendingToolEntries() {
        return this.pendingTools.entries();
    }
    clearPendingTools() {
        this.pendingTools.clear();
    }
    clearToolFlows() {
        this.toolFlowByToolCallId.clear();
        this.activeToolFlow = undefined;
    }
    clearAll() {
        this.clearPendingTools();
        this.clearToolFlows();
    }
    hasToolFlow(toolCallId) {
        return this.toolFlowByToolCallId.has(toolCallId);
    }
    setShowImages(enabled) {
        this.rendererHost.forEachChatChild((child) => {
            if (child instanceof ToolExecutionComponent) {
                child.setShowImages(enabled);
            }
        });
    }
    setImageWidthCells(width) {
        this.rendererHost.forEachChatChild((child) => {
            if (child instanceof ToolExecutionComponent) {
                child.setImageWidthCells(width);
            }
        });
    }
}
