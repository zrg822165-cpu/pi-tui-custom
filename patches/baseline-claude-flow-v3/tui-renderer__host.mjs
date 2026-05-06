import { Container, ProcessTerminal, TUI } from "@mariozechner/pi-tui";
import { attachRendererMainLayout, replaceContainerChild, setContainerChildren, setWidgetSlot } from "./renderer-layout.mjs";

export class TuiRendererHost {
    ui;
    headerContainer;
    chatContainer;
    pendingMessagesContainer;
    statusContainer;
    widgetContainerAbove;
    widgetContainerBelow;
    editorContainer;
    footerComponent = undefined;
    constructor(options = {}) {
        this.ui = new TUI(options.terminal ?? new ProcessTerminal(), options.showHardwareCursor);
        this.ui.setClearOnShrink(options.clearOnShrink);
        this.headerContainer = new Container();
        this.chatContainer = new Container();
        this.chatContainer.setAppendOnlyCacheEnabled?.(true);
        this.pendingMessagesContainer = new Container();
        this.statusContainer = new Container();
        this.widgetContainerAbove = new Container();
        this.widgetContainerBelow = new Container();
        this.editorContainer = new Container();
    }
    getParts() {
        return {
            ui: this.ui,
            headerContainer: this.headerContainer,
            chatContainer: this.chatContainer,
            pendingMessagesContainer: this.pendingMessagesContainer,
            statusContainer: this.statusContainer,
            widgetContainerAbove: this.widgetContainerAbove,
            widgetContainerBelow: this.widgetContainerBelow,
            editorContainer: this.editorContainer,
        };
    }
    getChatChildren() {
        return this.chatContainer.children;
    }
    hasChatChildren() {
        return this.chatContainer.children.length > 0;
    }
    appendChat(component) {
        this.chatContainer.addChild(component);
        return component;
    }
    removeChat(component) {
        this.chatContainer.removeChild(component);
    }
    clearChat() {
        this.chatContainer.clear();
    }
    forEachChatChild(callback) {
        for (const child of this.chatContainer.children) {
            callback(child);
        }
    }
    setTranscriptTailLines(lineBudget) {
        this.chatContainer.setVisibleTailLines?.(lineBudget);
    }
    setWidgetSlot(placement, components = [], options = {}) {
        const container = placement === "belowEditor" ? this.widgetContainerBelow : this.widgetContainerAbove;
        setWidgetSlot(container, components, options);
    }
    clearPending() {
        this.pendingMessagesContainer.clear();
    }
    appendPending(component) {
        this.pendingMessagesContainer.addChild(component);
        return component;
    }
    removePending(component) {
        this.pendingMessagesContainer.removeChild(component);
    }
    clearStatus() {
        this.statusContainer.clear();
    }
    appendStatus(component) {
        this.statusContainer.addChild(component);
        return component;
    }
    setStatus(component) {
        this.clearStatus();
        if (component) {
            this.appendStatus(component);
        }
    }
    setFocus(component) {
        this.ui.setFocus(component);
    }
    requestRender() {
        this.ui.requestRender();
    }
    invalidate() {
        this.ui.invalidate();
    }
    setHeader(children = []) {
        setContainerChildren(this.headerContainer, children);
    }
    replaceHeaderComponent(currentComponent, nextComponent) {
        replaceContainerChild(this.headerContainer, currentComponent, nextComponent);
    }
    setEditorComponent(component, options = {}) {
        this.editorContainer.clear();
        if (component) {
            this.editorContainer.addChild(component);
        }
        if (options.focus !== false && component) {
            this.ui.setFocus(component);
        }
    }
    setFooter(component) {
        if (this.footerComponent === component) {
            return;
        }
        if (this.footerComponent) {
            this.ui.removeChild(this.footerComponent);
        }
        this.footerComponent = component;
        if (component) {
            this.ui.addChild(component);
        }
    }
    attachMainLayout({ footer, editor }) {
        attachRendererMainLayout(this.ui, this.getParts(), { editor });
        this.setFooter(footer);
    }
}

export function createTuiRendererHost(options = {}) {
    return new TuiRendererHost(options);
}
