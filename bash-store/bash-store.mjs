import { BashExecutionComponent } from "../tui-renderer/index.mjs";
import { getSession, getSessionManager } from "../runtime-host-adapter/index.mjs";

export class BashStore {
    host;
    bashComponent = undefined;
    bashOutputBuffer = "";
    bashOutputFlushTimer = undefined;
    pendingBashComponents = [];
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
    getSessionManager() {
        return getSessionManager(this.host);
    }
    getBashOutputFlushMs() {
        const raw = Number(process.env.PI_TUI_TOOL_CHUNK_FLUSH_MS ?? "16");
        if (!Number.isFinite(raw)) {
            return 16;
        }
        return Math.max(0, Math.min(100, raw));
    }
    queueBashOutput(chunk) {
        if (!this.bashComponent || !chunk) {
            return;
        }
        const flushMs = this.getBashOutputFlushMs();
        if (flushMs === 0) {
            this.bashComponent.appendOutput(chunk);
            this.ui.requestRender();
            return;
        }
        this.bashOutputBuffer += chunk;
        if (this.bashOutputFlushTimer) {
            return;
        }
        this.bashOutputFlushTimer = setTimeout(() => {
            this.bashOutputFlushTimer = undefined;
            this.flushBashOutput();
        }, flushMs);
    }
    flushBashOutput() {
        if (this.bashOutputFlushTimer) {
            clearTimeout(this.bashOutputFlushTimer);
            this.bashOutputFlushTimer = undefined;
        }
        if (!this.bashOutputBuffer) {
            return false;
        }
        const chunk = this.bashOutputBuffer;
        this.bashOutputBuffer = "";
        if (!this.bashComponent) {
            return false;
        }
        this.bashComponent.appendOutput(chunk);
        this.ui.requestRender();
        return true;
    }
    flushPendingBashComponents() {
        for (const component of this.pendingBashComponents) {
            this.rendererHost.removePending(component);
            this.rendererHost.appendChat(component);
        }
        this.pendingBashComponents = [];
    }
    attachBashComponent(component, deferred) {
        if (deferred) {
            this.rendererHost.appendPending(component);
            this.pendingBashComponents.push(component);
        }
        else {
            this.rendererHost.appendChat(component);
        }
    }
    async handleBashCommand(command, excludeFromContext = false) {
        const session = this.getSession();
        const extensionRunner = session.extensionRunner;
        const eventResult = await extensionRunner.emitUserBash({
            type: "user_bash",
            command,
            excludeFromContext,
            cwd: this.getSessionManager().getCwd(),
        });
        if (eventResult?.result) {
            const result = eventResult.result;
            this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
            this.attachBashComponent(this.bashComponent, session.isStreaming);
            if (result.output) {
                this.bashComponent.appendOutput(result.output);
            }
            this.bashComponent.setComplete(result.exitCode, result.cancelled, result.truncated ? { truncated: true, content: result.output } : undefined, result.fullOutputPath);
            session.recordBashResult(command, result, { excludeFromContext });
            this.bashComponent = undefined;
            this.ui.requestRender();
            return;
        }
        const isDeferred = session.isStreaming;
        this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
        this.attachBashComponent(this.bashComponent, isDeferred);
        this.ui.requestRender();
        try {
            const result = await session.executeBash(command, (chunk) => {
                this.queueBashOutput(chunk);
            }, { excludeFromContext, operations: eventResult?.operations });
            this.flushBashOutput();
            if (this.bashComponent) {
                this.bashComponent.setComplete(result.exitCode, result.cancelled, result.truncated ? { truncated: true, content: result.output } : undefined, result.fullOutputPath);
            }
        }
        catch (error) {
            this.flushBashOutput();
            if (this.bashComponent) {
                this.bashComponent.setComplete(undefined, false);
            }
            this.host.showError(`Bash command failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        this.flushBashOutput();
        this.bashComponent = undefined;
        this.ui.requestRender();
    }
}
