export async function executeCompactionCommand(host, command) {
    switch (command?.type) {
        case "compaction:save_escape_handler":
            host.saveCompactionEscapeHandler();
            return true;
        case "compaction:set_abort_escape_handler":
            host.setCompactionAbortHandler();
            return true;
        case "status:compaction_loader_start":
            host.showCompactionLoader(command.args.reason);
            return true;
        case "compaction:restore_escape_handler":
            host.restoreCompactionEscapeHandler();
            return true;
        case "status:compaction_loader_stop":
            host.stopCompactionLoader();
            return true;
        case "notice:manual_compaction_cancelled":
            host.showError("Compaction cancelled");
            return true;
        case "notice:auto_compaction_cancelled":
            host.showStatus("Auto-compaction cancelled");
            return true;
        case "transcript:add_compaction_summary":
            host.addCompactionSummary(command.args.summary, command.args.tokensBefore);
            return true;
        case "notice:manual_compaction_error":
            host.showError(command.args.errorMessage);
            return true;
        case "transcript:add_compaction_error":
            host.addCompactionError(command.args.errorMessage);
            return true;
        case "compaction:flush_queue":
            void host.flushCompactionQueue({ willRetry: command.args.willRetry });
            return true;
        default:
            return false;
    }
}
