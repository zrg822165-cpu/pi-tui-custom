import { MissingSessionCwdError } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/session-cwd.js";

export async function handleCloneCommand(host) {
    const leafId = host.sessionStore.getLeafId();
    if (!leafId) {
        host.showStatus("Nothing to clone yet");
        return;
    }
    try {
        const result = await host.runtimeHost.fork(leafId, { position: "at" });
        if (result.cancelled) {
            host.ui.requestRender();
            return;
        }
        host.renderCurrentSessionState();
        host.editor.setText("");
        host.showStatus("Cloned to new session");
    }
    catch (error) {
        host.showError(error instanceof Error ? error.message : String(error));
    }
}

export async function handleResumeSession(host, sessionPath, options) {
    if (host.loadingAnimation) {
        host.loadingAnimation.stop();
        host.loadingAnimation = undefined;
    }
    host.rendererHost.clearStatus();
    try {
        const result = await host.runtimeHost.switchSession(sessionPath, {
            withSession: options?.withSession,
        });
        if (result.cancelled) {
            return result;
        }
        host.renderCurrentSessionState();
        host.showStatus("Resumed session");
        return result;
    }
    catch (error) {
        if (error instanceof MissingSessionCwdError) {
            const selectedCwd = await host.promptForMissingSessionCwd(error);
            if (!selectedCwd) {
                host.showStatus("Resume cancelled");
                return { cancelled: true };
            }
            const result = await host.runtimeHost.switchSession(sessionPath, {
                cwdOverride: selectedCwd,
                withSession: options?.withSession,
            });
            if (result.cancelled) {
                return result;
            }
            host.renderCurrentSessionState();
            host.showStatus("Resumed session in current cwd");
            return result;
        }
        return host.handleFatalRuntimeError("Failed to resume session", error);
    }
}
