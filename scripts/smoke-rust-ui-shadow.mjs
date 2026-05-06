import { ToolFlowStore } from "../tool-flow-store/tool-flow-store.mjs";
import { UIStateStore } from "../ui-state-store/ui-state-store.mjs";

const command = process.env.PI_UI_CORE_COMMAND;
if (!command) {
    throw new Error("Set PI_UI_CORE_COMMAND to the Rust UI core executable.");
}

process.env.PI_RUST_SHADOW = "1";
process.env.PI_RUST_SHADOW_STRICT = "1";

const store = new ToolFlowStore({
    options: { verbose: true },
    toolOutputExpanded: false,
    rendererHost: {},
    ui: {},
});

const startupExpanded = store.getStartupExpansionState();
const hiddenComponent = {
    toolCallId: "hidden",
    toolName: "unknown",
    args: {},
    expanded: false,
    executionStarted: false,
    argsComplete: false,
    result: undefined,
};
const forcedComponent = {
    ...hiddenComponent,
    toolCallId: "forced",
};
const alreadyAttachedComponent = {
    ...hiddenComponent,
    toolCallId: "attached",
};
store.toolFlowByToolCallId.set("attached", {});

const hiddenAttach = store.shouldAttachToolExecutionComponent(hiddenComponent);
const forcedAttach = store.shouldAttachToolExecutionComponent(forcedComponent, true);
const alreadyAttached = store.shouldAttachToolExecutionComponent(alreadyAttachedComponent, true);
const uiState = new UIStateStore({
    workingMessage: "Working",
    defaultWorkingMessage: "Default",
    session: {
        thinkingLevel: "high",
        model: { reasoning: true },
    },
});
const workingMessage = uiState.getWorkingLoaderMessage();
const showThinkingStatus = uiState.shouldShowThinkingStatus();

console.log(JSON.stringify({
    ok: true,
    startupExpanded,
    hiddenAttach,
    forcedAttach,
    alreadyAttached,
    workingMessage,
    showThinkingStatus,
}, null, 2));
