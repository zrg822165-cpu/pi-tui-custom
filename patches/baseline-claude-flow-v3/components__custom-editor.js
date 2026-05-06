import { Editor, visibleWidth } from "@mariozechner/pi-tui";
function color256(index, text) {
    return `\x1b[38;5;${index}m${text}\x1b[39m`;
}
/**
 * Custom editor that handles app-level keybindings for coding-agent.
 */
export class CustomEditor extends Editor {
    keybindings;
    actionHandlers = new Map();
    assistantActivityActive = false;
    assistantActivityFrame = 0;
    assistantActivityTimer;
    assistantActivityLabelFrame = -1;
    assistantActivityLabel = "";
    assistantActivityLabelWidth = 0;
    // Special handlers that can be dynamically replaced
    onEscape;
    onCtrlD;
    onPasteImage;
    /** Handler for extension-registered shortcuts. Returns true if handled. */
    onExtensionShortcut;
    constructor(tui, theme, keybindings, options) {
        super(tui, theme, options);
        this.keybindings = keybindings;
    }
    markAssistantActivityDirty() {
        this.__piDirtyVersion = (this.__piDirtyVersion ?? 0) + 1;
        this.parentContainer?.markDirty?.();
    }
    setAssistantActivity(active) {
        if (this.assistantActivityActive === active) {
            return;
        }
        this.assistantActivityActive = active;
        if (active) {
            this.assistantActivityFrame = 0;
            this.assistantActivityTimer = setInterval(() => {
                this.assistantActivityFrame++;
                this.assistantActivityLabelFrame = -1;
                this.markAssistantActivityDirty();
                this.tui.requestRender();
            }, 140);
        }
        else if (this.assistantActivityTimer) {
            clearInterval(this.assistantActivityTimer);
            this.assistantActivityTimer = undefined;
        }
        this.assistantActivityLabelFrame = -1;
        this.markAssistantActivityDirty();
        this.tui.requestRender();
    }
    renderAssistantActivityLabel() {
        const frame = this.assistantActivityFrame;
        if (this.assistantActivityLabelFrame === frame) {
            return this.assistantActivityLabel;
        }
        const dots = [".  ", ".. ", "..."][this.assistantActivityFrame % 3];
        const palette = [45, 81, 117, 159, 117, 81];
        const color = palette[this.assistantActivityFrame % palette.length];
        const label = color256(color, ` replying${dots} `);
        this.assistantActivityLabelFrame = frame;
        this.assistantActivityLabel = label;
        this.assistantActivityLabelWidth = visibleWidth(label);
        return label;
    }
    render(width) {
        const lines = super.render(width);
        if (!this.assistantActivityActive || lines.length === 0 || width < 18) {
            return lines;
        }
        const label = this.renderAssistantActivityLabel();
        const labelWidth = this.assistantActivityLabelWidth;
        const leftWidth = Math.max(1, width - labelWidth - 2);
        const rightWidth = Math.max(0, width - labelWidth - leftWidth);
        lines[0] = this.borderColor("─".repeat(leftWidth)) + label + this.borderColor("─".repeat(rightWidth));
        return lines;
    }
    dispose() {
        this.setAssistantActivity(false);
    }
    /**
     * Register a handler for an app action.
     */
    onAction(action, handler) {
        this.actionHandlers.set(action, handler);
    }
    handleInput(data) {
        // Check extension-registered shortcuts first
        if (this.onExtensionShortcut?.(data)) {
            return;
        }
        // Check for paste image keybinding
        if (this.keybindings.matches(data, "app.clipboard.pasteImage")) {
            this.onPasteImage?.();
            return;
        }
        // Check app keybindings first
        // Escape/interrupt - only if autocomplete is NOT active
        if (this.keybindings.matches(data, "app.interrupt")) {
            if (!this.isShowingAutocomplete()) {
                // Use dynamic onEscape if set, otherwise registered handler
                const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt");
                if (handler) {
                    handler();
                    return;
                }
            }
            // Let parent handle escape for autocomplete cancellation
            super.handleInput(data);
            return;
        }
        // Exit (Ctrl+D) - only when editor is empty
        if (this.keybindings.matches(data, "app.exit")) {
            if (this.getText().length === 0) {
                const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
                if (handler)
                    handler();
                return;
            }
            // Fall through to editor handling for delete-char-forward when not empty
        }
        // Check all other app actions
        for (const [action, handler] of this.actionHandlers) {
            if (action !== "app.interrupt" && action !== "app.exit" && this.keybindings.matches(data, action)) {
                handler();
                return;
            }
        }
        // Pass to parent for editor handling
        super.handleInput(data);
    }
}
//# sourceMappingURL=custom-editor.js.map
