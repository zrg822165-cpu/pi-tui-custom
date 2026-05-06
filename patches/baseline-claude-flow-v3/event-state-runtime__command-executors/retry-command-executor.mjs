export async function executeRetryCommand(host, command) {
    switch (command?.type) {
        case "retry:restore_escape_handler":
            host.restoreRetryEscapeHandler();
            return true;
        case "retry:countdown_dispose":
            host.disposeRetryCountdown();
            return true;
        case "retry:loader_stop":
            host.stopRetryLoader();
            return true;
        case "retry:save_escape_handler":
            host.saveRetryEscapeHandler();
            return true;
        case "retry:set_abort_escape_handler":
            host.setRetryAbortHandler();
            return true;
        case "retry:countdown_dispose_existing":
            host.disposeExistingRetryCountdown();
            return true;
        case "status:retry_loader_start":
            host.showRetryLoader(command.args);
            return true;
        case "status:retry_loader_stop":
            host.stopRetryLoader({ clearStatus: true });
            return true;
        case "notice:retry_failed":
            host.showError(`Retry failed after ${command.args.attempt} attempts: ${command.args.finalError || "Unknown error"}`);
            return true;
        default:
            return false;
    }
}
