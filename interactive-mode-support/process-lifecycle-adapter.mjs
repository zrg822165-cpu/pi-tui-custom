import { killTrackedDetachedChildren } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/shell.js";

export function handleCtrlD(host) {
    void host.shutdown();
}

export async function shutdown(host) {
    if (host.isShuttingDown)
        return;
    host.isShuttingDown = true;
    host.unregisterSignalHandlers();
    await host.ui.terminal.drainInput(1000);
    host.stop();
    await host.runtimeHost.dispose();
    process.exit(0);
}

export async function checkShutdownRequested(host) {
    if (!host.shutdownRequested)
        return;
    await host.shutdown();
}

export function registerSignalHandlers(host) {
    host.unregisterSignalHandlers();
    const signals = ["SIGTERM"];
    if (process.platform !== "win32") {
        signals.push("SIGHUP");
    }
    for (const signal of signals) {
        const handler = () => {
            killTrackedDetachedChildren();
            void host.shutdown();
        };
        process.on(signal, handler);
        host.signalCleanupHandlers.push(() => process.off(signal, handler));
    }
}

export function unregisterSignalHandlers(host) {
    for (const cleanup of host.signalCleanupHandlers) {
        cleanup();
    }
    host.signalCleanupHandlers = [];
}

export function handleCtrlZ(host) {
    if (process.platform === "win32") {
        host.showStatus("Suspend to background is not supported on Windows");
        return;
    }
    const suspendKeepAlive = setInterval(() => { }, 2 ** 30);
    const ignoreSigint = () => { };
    process.on("SIGINT", ignoreSigint);
    process.once("SIGCONT", () => {
        clearInterval(suspendKeepAlive);
        process.removeListener("SIGINT", ignoreSigint);
        host.ui.start();
        host.ui.requestRender(true);
    });
    try {
        host.ui.stop();
        process.kill(0, "SIGTSTP");
    }
    catch (error) {
        clearInterval(suspendKeepAlive);
        process.removeListener("SIGINT", ignoreSigint);
        throw error;
    }
}

export function stop(host) {
    host.unregisterSignalHandlers();
    host.flushStreamingMessageUpdate();
    host.flushToolExecutionUpdates();
    host.flushBashOutput();
    host.defaultEditor.setAssistantActivity(false);
    if (host.settingsManager.getShowTerminalProgress()) {
        host.ui.terminal.setProgress(false);
    }
    if (host.loadingAnimation) {
        host.loadingAnimation.stop();
        host.loadingAnimation = undefined;
    }
    host.clearExtensionTerminalInputListeners();
    host.customTuiRenderer?.stop?.();
    host.footer.dispose();
    host.footerDataProvider.dispose();
    if (host.unsubscribe) {
        host.unsubscribe();
    }
    host.eventStateRuntime?.dispose?.();
    if (host.isInitialized) {
        host.ui.stop();
        host.isInitialized = false;
    }
}
