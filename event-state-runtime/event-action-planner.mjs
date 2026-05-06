import { classifyEvent, getMessageRole } from "./event-types.mjs";
import { getPlanRenderReason } from "./plan-registry.mjs";
import { runRustCoreValue } from "../rust-core-shadow/runner.mjs";

export function planEventActions(event, snapshot = {}) {
    const rust = runRustCoreValue({ commandEnv: "PI_EVENT_CORE_COMMAND", op: "planEventActions", input: { ...event, snapshot } });
    if (rust.ok) {
        return rust.value;
    }
    const type = event?.type;
    const role = getMessageRole(event);
    const actions = ["footer:invalidate"];
    const render = { request: false, reason: undefined };
    const transcript = { tailRendering: undefined, streamingAssistant: undefined };
    const tool = { attach: false, update: false, flushUpdates: false, clearPending: false };
    const status = { toolThinking: undefined, loader: undefined };

    switch (type) {
        case "agent_start":
            actions.push("editor:assistant_activity_on", "retry:clear", "status:working_loader_maybe", "status:tool_thinking_stop");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "queue_update":
            actions.push("queue:update_pending_messages");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "session_info_changed":
            actions.push("terminal:update_title");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "thinking_level_changed":
            actions.push("editor:update_border_color");
            break;
        case "message_start":
            if (role === "custom") {
                actions.push("transcript:add_message");
                render.request = true;
                render.reason = getPlanRenderReason(type, role);
            }
            else if (role === "user") {
                actions.push("tool_flow:reset", "transcript:add_message", "queue:update_pending_messages");
                transcript.tailRendering = true;
                render.request = true;
                render.reason = getPlanRenderReason(type, role);
            }
            else if (role === "assistant") {
                actions.push("transcript:assistant_stream_start", "status:assistant_start");
                transcript.tailRendering = true;
                transcript.streamingAssistant = "start";
                status.toolThinking = "requesting";
                status.loader = "response_maybe";
                render.request = true;
                render.reason = getPlanRenderReason(type, role);
            }
            break;
        case "message_update":
            if (role === "assistant") {
                actions.push("transcript:assistant_stream_queue_update");
                transcript.streamingAssistant = "update";
            }
            break;
        case "message_end":
            if (role === "assistant") {
                actions.push("transcript:assistant_stream_flush", "transcript:assistant_stream_finish", "tools:finalize_pending_args");
                transcript.streamingAssistant = "finish";
                if (event.message?.stopReason === "aborted" || event.message?.stopReason === "error") {
                    actions.push("tools:mark_pending_error", "tools:clear_pending");
                    tool.clearPending = true;
                }
                if (event.message?.stopReason === "end_turn") {
                    status.toolThinking = "stop_if_visible_text";
                }
            }
            render.request = role !== "user";
            render.reason = getPlanRenderReason(type, role);
            break;
        case "tool_execution_start":
            actions.push("tool:create_if_missing", "tool:attach", "tool:mark_started", "tool_flow:update", "status:tool_executing");
            tool.attach = true;
            status.toolThinking = "executing_tool";
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "tool_execution_update":
            actions.push("tool:queue_update");
            tool.update = true;
            break;
        case "tool_execution_end":
            actions.push("tool:flush_updates", "tool:attach", "tool:update_result", "tool_flow:update", "status:tool_requesting", "tool:delete_pending");
            tool.attach = true;
            tool.flushUpdates = true;
            status.toolThinking = "requesting";
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "agent_end":
            actions.push("editor:assistant_activity_off", "status:terminal_progress_off", "status:loader_stop", "status:tool_thinking_stop", "transcript:assistant_stream_remove", "tool_flow:clear", "shutdown:check");
            transcript.tailRendering = false;
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "compaction_start":
            actions.push("compaction:start", "status:compaction_loader_start");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "compaction_end":
            actions.push("compaction:end", "compaction:flush_queue");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "auto_retry_start":
            actions.push("retry:start", "status:retry_loader_start");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        case "auto_retry_end":
            actions.push("retry:end", "status:retry_loader_stop");
            render.request = true;
            render.reason = getPlanRenderReason(type, role);
            break;
        default:
            actions.push("event:unknown");
            break;
    }

    return {
        eventType: type,
        eventGroup: classifyEvent(event),
        phase: snapshot.phase,
        actions,
        render,
        transcript,
        tool,
        status,
    };
}
