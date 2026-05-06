import { AssistantMessageComponent, ThinkingStatusComponent } from "../tui-renderer/index.mjs";
import { getSession } from "../runtime-host-adapter/index.mjs";
import { runRustCoreValue, runRustShadow } from "../../rust-core-shadow/runner.mjs";

function runUiShadow({ name, op, input, jsValue }) {
    return runRustShadow({
        name,
        commandEnv: "PI_UI_CORE_COMMAND",
        op,
        input,
        jsValue,
    });
}

function runUiCore(op, input) {
    return runRustCoreValue({ commandEnv: "PI_UI_CORE_COMMAND", op, input });
}

export class UIStateStore {
    host;
    constructor(host) {
        this.host = host;
    }
    get ui() {
        return this.host.ui;
    }
    get rendererHost() {
        return this.host.rendererHost;
    }
    getSession() {
        return getSession(this.host);
    }
    getWorkingLoaderMessage() {
        const input = {
            workingMessage: this.host.workingMessage,
            defaultWorkingMessage: this.host.defaultWorkingMessage,
        };
        const rust = runUiCore("workingLoaderMessage", input);
        if (rust.ok) {
            return rust.value;
        }
        const result = this.host.workingMessage ?? this.host.defaultWorkingMessage;
        runUiShadow({
            name: "ui.workingLoaderMessage",
            op: "workingLoaderMessage",
            input,
            jsValue: result,
        });
        return result;
    }
    createWorkingLoader() {
        const message = this.host.workingMessage ?? "Waiting for model";
        return new ThinkingStatusComponent(this.ui, message, { showTokenDetails: false, phase: "waiting", words: [message] });
    }
    createResponseLoader() {
        const message = "Receiving response";
        return new ThinkingStatusComponent(this.ui, message, { showTokenDetails: false, phase: "responding", words: [message] });
    }
    shouldShowThinkingStatus() {
        const session = this.getSession();
        const input = {
            thinkingLevel: session?.thinkingLevel,
            modelHasReasoning: !!session?.model?.reasoning,
        };
        const rust = runUiCore("shouldShowThinkingStatus", input);
        if (rust.ok) {
            return rust.value;
        }
        const result = session?.thinkingLevel !== "off" && !!session?.model?.reasoning;
        runUiShadow({
            name: "ui.shouldShowThinkingStatus",
            op: "shouldShowThinkingStatus",
            input,
            jsValue: result,
        });
        return result;
    }
    ensureResponseLoader() {
        if (this.host.thinkingStatus) {
            return;
        }
        if (this.host.loadingAnimation) {
            this.host.loadingAnimation.stop();
            this.host.loadingAnimation = undefined;
        }
        this.host.loadingAnimation = this.createResponseLoader();
        this.rendererHost.setStatus(this.host.loadingAnimation);
    }
    ensureToolThinkingStatus() {
        const inheritedStartedAt = this.host.loadingAnimation?.startedAt;
        if (this.host.loadingAnimation) {
            this.host.loadingAnimation.stop();
            this.host.loadingAnimation = undefined;
        }
        if (!this.host.thinkingStatus) {
            this.host.thinkingStatus = new ThinkingStatusComponent(this.ui, undefined, {
                showTokenDetails: true,
                phase: "requesting",
                startedAt: inheritedStartedAt,
            });
            this.rendererHost.setStatus(this.host.thinkingStatus);
        }
        this.host.thinkingStatus.enableTokenDetails();
        return this.host.thinkingStatus;
    }
    stopToolThinkingStatus() {
        if (this.host.thinkingStatus) {
            this.host.thinkingStatus.stop();
            this.host.thinkingStatus = undefined;
        }
        if (!this.host.loadingAnimation) {
            this.rendererHost.clearStatus();
        }
    }
    stopWorkingLoader() {
        if (this.host.loadingAnimation) {
            this.host.loadingAnimation.stop();
            this.host.loadingAnimation = undefined;
        }
        if (this.host.thinkingStatus) {
            this.host.thinkingStatus.stop();
            this.host.thinkingStatus = undefined;
        }
        this.rendererHost.clearStatus();
    }
    setWorkingVisible(visible) {
        this.host.workingVisible = visible;
        if (!visible) {
            this.stopWorkingLoader();
            this.ui.requestRender();
            return;
        }
        if (this.getSession()?.isStreaming && !this.host.loadingAnimation) {
            this.host.loadingAnimation = this.createWorkingLoader();
            this.rendererHost.setStatus(this.host.loadingAnimation);
        }
        this.ui.requestRender();
    }
    setWorkingIndicator(options) {
        this.host.workingIndicatorOptions = options;
        this.host.loadingAnimation?.setIndicator(options);
        this.ui.requestRender();
    }
    setHiddenThinkingLabel(label) {
        this.host.hiddenThinkingLabel = label ?? this.host.defaultHiddenThinkingLabel;
        this.rendererHost.forEachChatChild((child) => {
            if (child instanceof AssistantMessageComponent) {
                child.setHiddenThinkingLabel(this.host.hiddenThinkingLabel);
            }
        });
        if (this.host.streamingComponent) {
            this.host.streamingComponent.setHiddenThinkingLabel(this.host.hiddenThinkingLabel);
        }
        this.ui.requestRender();
    }
}
