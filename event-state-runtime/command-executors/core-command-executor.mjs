export async function executeCoreCommand(host, command) {
    switch (command?.type) {
        case "queue:update_pending_messages":
            host.updatePendingMessagesDisplay();
            return true;
        case "terminal:update_title":
            host.updateTerminalTitle();
            return true;
        case "footer:invalidate":
            host.invalidateFooter();
            return true;
        case "editor:update_border_color":
            host.updateEditorBorderColor();
            return true;
        case "render:request":
            host.requestRender();
            return true;
        case "editor:assistant_activity_on":
            host.setAssistantActivity(true);
            return true;
        case "editor:assistant_activity_off":
            host.setAssistantActivity(false);
            return true;
        case "terminal:progress_on":
            host.setTerminalProgress(true);
            return true;
        case "terminal:progress_off":
            host.setTerminalProgress(false);
            return true;
        case "status:working_loader_start":
            host.startWorkingLoaderIfVisible();
            return true;
        case "status:loader_stop":
            host.stopWorkingLoader();
            return true;
        case "status:clear":
            host.clearStatusLine();
            return true;
        case "shutdown:check":
            await host.checkShutdownRequested();
            return true;
        default:
            return false;
    }
}
