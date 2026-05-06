use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    PlanEventActions(EventPlanInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    EventPlan(EventPlan),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::PlanEventActions(input) => {
            OperationResult::EventPlan(plan_event_actions(&input))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPlanInput {
    #[serde(flatten)]
    pub event: EventInput,
    #[serde(default)]
    pub snapshot: SnapshotInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    #[serde(default)]
    pub message: Option<MessageInput>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub stop_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInput {
    #[serde(default)]
    pub phase: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPlan {
    pub event_type: Option<String>,
    pub event_group: String,
    pub phase: Option<String>,
    pub actions: Vec<String>,
    pub render: RenderPlan,
    pub transcript: TranscriptPlan,
    pub tool: ToolPlan,
    pub status: StatusPlan,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPlan {
    pub request: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPlan {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tail_rendering: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming_assistant: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPlan {
    pub attach: bool,
    pub update: bool,
    pub flush_updates: bool,
    pub clear_pending: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPlan {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loader: Option<String>,
}

pub fn plan_event_actions(input: &EventPlanInput) -> EventPlan {
    let event_type = input.event.event_type.as_deref();
    let role = input
        .event
        .message
        .as_ref()
        .and_then(|message| message.role.as_deref());
    let mut plan = EventPlan {
        event_type: input.event.event_type.clone(),
        event_group: classify_event(event_type),
        phase: input.snapshot.phase.clone(),
        actions: vec!["footer:invalidate".to_owned()],
        render: RenderPlan {
            request: false,
            reason: None,
        },
        transcript: TranscriptPlan {
            tail_rendering: None,
            streaming_assistant: None,
        },
        tool: ToolPlan {
            attach: false,
            update: false,
            flush_updates: false,
            clear_pending: false,
        },
        status: StatusPlan {
            tool_thinking: None,
            loader: None,
        },
    };

    match event_type {
        Some("agent_start") => {
            push_actions(
                &mut plan,
                [
                    "editor:assistant_activity_on",
                    "retry:clear",
                    "status:working_loader_maybe",
                    "status:tool_thinking_stop",
                ],
            );
            request_render(&mut plan, event_type, role);
        }
        Some("queue_update") => {
            push_actions(&mut plan, ["queue:update_pending_messages"]);
            request_render(&mut plan, event_type, role);
        }
        Some("session_info_changed") => {
            push_actions(&mut plan, ["terminal:update_title"]);
            request_render(&mut plan, event_type, role);
        }
        Some("thinking_level_changed") => {
            push_actions(&mut plan, ["editor:update_border_color"]);
        }
        Some("message_start") => match role {
            Some("custom") => {
                push_actions(&mut plan, ["transcript:add_message"]);
                request_render(&mut plan, event_type, role);
            }
            Some("user") => {
                push_actions(
                    &mut plan,
                    [
                        "tool_flow:reset",
                        "transcript:add_message",
                        "queue:update_pending_messages",
                    ],
                );
                plan.transcript.tail_rendering = Some(true);
                request_render(&mut plan, event_type, role);
            }
            Some("assistant") => {
                push_actions(
                    &mut plan,
                    [
                        "transcript:assistant_stream_start",
                        "status:assistant_start",
                    ],
                );
                plan.transcript.tail_rendering = Some(true);
                plan.transcript.streaming_assistant = Some("start".to_owned());
                plan.status.tool_thinking = Some("requesting".to_owned());
                plan.status.loader = Some("response_maybe".to_owned());
                request_render(&mut plan, event_type, role);
            }
            _ => {}
        },
        Some("message_update") => {
            if role == Some("assistant") {
                push_actions(&mut plan, ["transcript:assistant_stream_queue_update"]);
                plan.transcript.streaming_assistant = Some("update".to_owned());
            }
        }
        Some("message_end") => {
            if role == Some("assistant") {
                push_actions(
                    &mut plan,
                    [
                        "transcript:assistant_stream_flush",
                        "transcript:assistant_stream_finish",
                        "tools:finalize_pending_args",
                    ],
                );
                plan.transcript.streaming_assistant = Some("finish".to_owned());
                let stop_reason = input
                    .event
                    .message
                    .as_ref()
                    .and_then(|message| message.stop_reason.as_deref());
                if matches!(stop_reason, Some("aborted" | "error")) {
                    push_actions(
                        &mut plan,
                        ["tools:mark_pending_error", "tools:clear_pending"],
                    );
                    plan.tool.clear_pending = true;
                }
                if stop_reason == Some("end_turn") {
                    plan.status.tool_thinking = Some("stop_if_visible_text".to_owned());
                }
            }
            plan.render.request = role != Some("user");
            plan.render.reason = plan_render_reason(event_type, role);
        }
        Some("tool_execution_start") => {
            push_actions(
                &mut plan,
                [
                    "tool:create_if_missing",
                    "tool:attach",
                    "tool:mark_started",
                    "tool_flow:update",
                    "status:tool_executing",
                ],
            );
            plan.tool.attach = true;
            plan.status.tool_thinking = Some("executing_tool".to_owned());
            request_render(&mut plan, event_type, role);
        }
        Some("tool_execution_update") => {
            push_actions(&mut plan, ["tool:queue_update"]);
            plan.tool.update = true;
        }
        Some("tool_execution_end") => {
            push_actions(
                &mut plan,
                [
                    "tool:flush_updates",
                    "tool:attach",
                    "tool:update_result",
                    "tool_flow:update",
                    "status:tool_requesting",
                    "tool:delete_pending",
                ],
            );
            plan.tool.attach = true;
            plan.tool.flush_updates = true;
            plan.status.tool_thinking = Some("requesting".to_owned());
            request_render(&mut plan, event_type, role);
        }
        Some("agent_end") => {
            push_actions(
                &mut plan,
                [
                    "editor:assistant_activity_off",
                    "status:terminal_progress_off",
                    "status:loader_stop",
                    "status:tool_thinking_stop",
                    "transcript:assistant_stream_remove",
                    "tool_flow:clear",
                    "shutdown:check",
                ],
            );
            plan.transcript.tail_rendering = Some(false);
            request_render(&mut plan, event_type, role);
        }
        Some("compaction_start") => {
            push_actions(
                &mut plan,
                ["compaction:start", "status:compaction_loader_start"],
            );
            request_render(&mut plan, event_type, role);
        }
        Some("compaction_end") => {
            push_actions(&mut plan, ["compaction:end", "compaction:flush_queue"]);
            request_render(&mut plan, event_type, role);
        }
        Some("auto_retry_start") => {
            push_actions(&mut plan, ["retry:start", "status:retry_loader_start"]);
            request_render(&mut plan, event_type, role);
        }
        Some("auto_retry_end") => {
            push_actions(&mut plan, ["retry:end", "status:retry_loader_stop"]);
            request_render(&mut plan, event_type, role);
        }
        _ => push_actions(&mut plan, ["event:unknown"]),
    }

    plan
}

fn push_actions<const N: usize>(plan: &mut EventPlan, actions: [&str; N]) {
    plan.actions.extend(actions.into_iter().map(str::to_owned));
}

fn request_render(plan: &mut EventPlan, event_type: Option<&str>, role: Option<&str>) {
    plan.render.request = true;
    plan.render.reason = plan_render_reason(event_type, role);
}

fn classify_event(event_type: Option<&str>) -> String {
    match event_type {
        Some("agent_start" | "agent_end") => "agent",
        Some("message_start" | "message_update" | "message_end") => "message",
        Some("tool_execution_start" | "tool_execution_update" | "tool_execution_end") => "tool",
        Some("compaction_start" | "compaction_end") => "compaction",
        Some("auto_retry_start" | "auto_retry_end") => "retry",
        Some("queue_update") => "queue",
        Some("session_info_changed" | "thinking_level_changed") => "session",
        _ => "unknown",
    }
    .to_owned()
}

fn plan_render_reason(event_type: Option<&str>, role: Option<&str>) -> Option<String> {
    let reason = match event_type {
        Some("agent_start") => Some("agent_start"),
        Some("queue_update") => Some("queue_update"),
        Some("session_info_changed") => Some("session_info_changed"),
        Some("message_start") => match role {
            Some("custom") => Some("custom_message_start"),
            Some("user") => Some("user_message_start"),
            Some("assistant") => Some("assistant_message_start"),
            _ => None,
        },
        Some("message_end") => match role {
            Some("user") => None,
            _ => Some("message_end"),
        },
        Some("tool_execution_start") => Some("tool_execution_start"),
        Some("tool_execution_end") => Some("tool_execution_end"),
        Some("agent_end") => Some("agent_end"),
        Some("compaction_start") => Some("compaction_start"),
        Some("compaction_end") => Some("compaction_end"),
        Some("auto_retry_start") => Some("auto_retry_start"),
        Some("auto_retry_end") => Some("auto_retry_end"),
        _ => None,
    };
    reason.map(str::to_owned)
}
