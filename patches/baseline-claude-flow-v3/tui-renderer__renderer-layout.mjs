import { Spacer } from "@mariozechner/pi-tui";

export function setContainerChildren(container, children = []) {
    container.clear();
    for (const child of children) {
        container.addChild(child);
    }
}

export function setWidgetSlot(container, components = [], options = {}) {
    container.clear();
    if (components.length === 0) {
        if (options.spacerWhenEmpty) {
            container.addChild(new Spacer(1));
        }
        return;
    }
    if (options.leadingSpacer) {
        container.addChild(new Spacer(1));
    }
    for (const component of components) {
        container.addChild(component);
    }
}

export function replaceContainerChild(container, currentComponent, nextComponent) {
    const index = container.children.indexOf(currentComponent);
    if (index !== -1) {
        container.children[index] = nextComponent;
    }
    else {
        container.children.unshift(nextComponent);
    }
    container.markDirty?.();
}

export function attachRendererMainLayout(ui, parts, options = {}) {
    if (parts.headerContainer.children.length > 0) {
        ui.addChild(parts.headerContainer);
    }
    ui.addChild(parts.chatContainer);
    ui.addChild(parts.pendingMessagesContainer);
    ui.addChild(parts.statusContainer);
    ui.addChild(parts.widgetContainerAbove);
    ui.addChild(parts.editorContainer);
    ui.addChild(parts.widgetContainerBelow);
    if (options.editor) {
        ui.setFocus(options.editor);
    }
}
