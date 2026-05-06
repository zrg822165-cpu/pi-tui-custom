import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

function isExpandable(obj) {
    return typeof obj === "object" && obj !== null && "setExpanded" in obj && typeof obj.setExpanded === "function";
}

export function updateEditorBorderColor(host) {
    if (host.isBashMode) {
        host.editor.borderColor = theme.getBashModeBorderColor();
    }
    else {
        const level = host.sessionStore.getThinkingLevel() || "off";
        host.editor.borderColor = theme.getThinkingBorderColor(level);
    }
    host.ui.requestRender();
}

export function cycleThinkingLevel(host) {
    const newLevel = host.sessionStore.cycleThinkingLevel();
    if (newLevel === undefined) {
        host.showStatus("Current model does not support thinking");
    }
    else {
        host.footer.invalidate();
        host.updateEditorBorderColor();
        host.showStatus(`Thinking level: ${newLevel}`);
    }
}

export async function cycleModel(host, direction) {
    try {
        const result = await host.sessionStore.cycleModel(direction);
        if (result === undefined) {
            const msg = host.sessionStore.hasScopedModels() ? "Only one model in scope" : "Only one model available";
            host.showStatus(msg);
        }
        else {
            host.footer.invalidate();
            host.updateEditorBorderColor();
            const thinkingStr = result.model.reasoning && result.thinkingLevel !== "off" ? ` (thinking: ${result.thinkingLevel})` : "";
            host.showStatus(`Switched to ${result.model.name || result.model.id}${thinkingStr}`);
            void host.maybeWarnAboutAnthropicSubscriptionAuth(result.model);
        }
    }
    catch (error) {
        host.showError(error instanceof Error ? error.message : String(error));
    }
}

export function toggleToolOutputExpansion(host) {
    host.setToolsExpanded(!host.toolOutputExpanded);
}

export function setToolsExpanded(host, expanded) {
    host.toolOutputExpanded = expanded;
    const activeHeader = host.customHeader ?? host.builtInHeader;
    if (isExpandable(activeHeader)) {
        activeHeader.setExpanded(expanded);
    }
    host.rendererHost.forEachChatChild((child) => {
        if (isExpandable(child)) {
            child.setExpanded(expanded);
        }
    });
    host.ui.requestRender();
}

export function setThinkingBlockVisibility(host, hidden) {
    host.hideThinkingBlock = hidden;
    host.settingsManager.setHideThinkingBlock(host.hideThinkingBlock);
    host.rendererHost.clearChat();
    host.rebuildChatFromMessages();
    host.transcriptStore.syncStreamingAssistantDisplayOptions();
    host.showStatus(`Thinking blocks: ${host.hideThinkingBlock ? "hidden" : "visible"}`);
}

export function toggleThinkingBlockVisibility(host) {
    host.setThinkingBlockVisibility(!host.hideThinkingBlock);
}
