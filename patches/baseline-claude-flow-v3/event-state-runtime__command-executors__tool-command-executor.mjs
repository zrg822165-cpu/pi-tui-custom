export async function executeToolCommand(host, command) {
    switch (command?.type) {
        case "status:tool_thinking_stop":
            host.stopToolThinkingStatus();
            return true;
        case "tool_flow:clear":
            host.clearToolFlowState();
            return true;
        case "tool:flush_updates":
            host.flushToolExecutionUpdates();
            return true;
        case "tool:create_pending_if_missing": {
            host.createPendingToolIfMissing(command.args.toolCallId, command.args.toolName, command.args.args);
            return true;
        }
        case "tool:attach": {
            host.attachPendingToolIfReady(command.args.toolCallId);
            return true;
        }
        case "tool:mark_started": {
            host.markPendingToolStarted(command.args.toolCallId);
            return true;
        }
        case "tool:update_result": {
            host.updatePendingToolResult(command.args.toolCallId, command.args.result, command.args.isError);
            return true;
        }
        case "tool:delete_pending":
            host.deletePendingTool(command.args.toolCallId);
            return true;
        case "tool:queue_update": {
            host.queuePendingToolUpdate(command.args.toolCallId, command.args.event);
            return true;
        }
        case "tool_flow:update":
            host.updateToolFlowForToolCall(command.args.toolCallId);
            return true;
        case "status:tool_executing":
            host.markToolThinkingActivity("executing_tool");
            return true;
        case "status:tool_requesting":
            host.markToolThinkingActivity("requesting");
            return true;
        case "tool_flow:reset":
            host.resetActiveToolFlow();
            return true;
        case "status:tool_thinking_requesting":
            host.setToolThinkingPhase("requesting");
            return true;
        case "tool:mark_pending_error":
            host.markAllPendingToolsError(command.args.errorMessage);
            return true;
        case "tool:clear_pending":
            host.clearPendingTools();
            return true;
        case "tool:finalize_pending_args":
            host.finalizePendingToolArgs();
            return true;
        case "status:tool_thinking_stop_if_visible_text":
            host.stopToolThinkingIfVisibleText();
            return true;
        default:
            return false;
    }
}
