use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    PlanEventActions(EventPlanInput),
    ApplyEventSequence(EventSequenceInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    EventPlan(EventPlan),
    Transitions(Vec<StateTransition>),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::PlanEventActions(input) => {
            OperationResult::EventPlan(plan_event_actions(&input))
        }
        Operation::ApplyEventSequence(input) => {
            OperationResult::Transitions(apply_event_sequence(&input))
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
    #[serde(default)]
    pub parts: Vec<MessagePartInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePartInput {
    #[serde(rename = "type")]
    pub part_type: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSequenceInput {
    #[serde(default)]
    pub events: Vec<EventInput>,
    #[serde(default)]
    pub start_now: u64,
    #[serde(default = "default_now_step")]
    pub now_step: u64,
}

fn default_now_step() -> u64 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventCoreState {
    pub sequence: u64,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_group: Option<String>,
    pub agent: AgentState,
    pub messages: MessageState,
    pub tools: ToolStateSnapshot,
    pub stream: StreamState,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentState {
    pub active: bool,
    pub starts: u64,
    pub ends: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_started_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_ended_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_message_id: Option<String>,
    pub starts: u64,
    pub updates: u64,
    pub ends: u64,
    pub by_role: BTreeMap<String, RoleBucket>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_stop_reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleBucket {
    pub starts: u64,
    pub updates: u64,
    pub ends: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStateSnapshot {
    pub starts: u64,
    pub updates: u64,
    pub ends: u64,
    pub errors: u64,
    pub active_count: usize,
    pub active: Vec<ToolActive>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tool_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolActive {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub updates: u64,
    pub started: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamState {
    pub assistant_streaming: bool,
    pub visible_assistant_text_started: bool,
    pub message_updates_in_stream: u64,
    pub tool_events_in_stream: u64,
    pub last_phase: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateTransition {
    pub sequence: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    pub event_group: String,
    pub phase: String,
    pub previous_phase: String,
    pub phase_hint: String,
    pub actions: Vec<String>,
    pub snapshot: EventCoreState,
}

#[derive(Debug, Clone)]
struct EventMachine {
    state: EventCoreState,
    active_tools: BTreeMap<String, ToolActive>,
}

pub fn apply_event_sequence(input: &EventSequenceInput) -> Vec<StateTransition> {
    let mut machine = EventMachine::new();
    input
        .events
        .iter()
        .enumerate()
        .map(|(index, event)| {
            machine.apply(
                event,
                input.start_now + (index as u64).saturating_mul(input.now_step),
            )
        })
        .collect()
}

impl EventMachine {
    fn new() -> Self {
        Self {
            state: EventCoreState {
                sequence: 0,
                phase: "idle".to_owned(),
                last_event_type: None,
                last_event_group: None,
                agent: AgentState {
                    active: false,
                    starts: 0,
                    ends: 0,
                    last_started_at: None,
                    last_ended_at: None,
                },
                messages: MessageState {
                    active_role: None,
                    active_message_id: None,
                    starts: 0,
                    updates: 0,
                    ends: 0,
                    by_role: BTreeMap::new(),
                    last_role: None,
                    last_stop_reason: None,
                },
                tools: ToolStateSnapshot {
                    starts: 0,
                    updates: 0,
                    ends: 0,
                    errors: 0,
                    active_count: 0,
                    active: Vec::new(),
                    last_tool_call_id: None,
                    last_tool_name: None,
                },
                stream: StreamState {
                    assistant_streaming: false,
                    visible_assistant_text_started: false,
                    message_updates_in_stream: 0,
                    tool_events_in_stream: 0,
                    last_phase: "idle".to_owned(),
                },
            },
            active_tools: BTreeMap::new(),
        }
    }

    fn apply(&mut self, event: &EventInput, now: u64) -> StateTransition {
        let previous_phase = self.state.phase.clone();
        let group = classify_event(event.event_type.as_deref());
        let mut actions = Vec::new();
        actions.extend(self.reduce_agent(event, now));
        actions.extend(self.reduce_message(event));
        actions.extend(self.reduce_tool(event));
        actions.extend(self.reduce_stream(event));
        self.state.sequence += 1;
        self.state.last_event_type = event.event_type.clone();
        self.state.last_event_group = Some(group.clone());
        self.state.phase = self.resolve_phase(event);
        self.refresh_tool_snapshot();

        StateTransition {
            sequence: self.state.sequence,
            event_type: event.event_type.clone(),
            event_group: group,
            phase: self.state.phase.clone(),
            previous_phase,
            phase_hint: event_phase_hint(event),
            actions,
            snapshot: self.state.clone(),
        }
    }

    fn reduce_agent(&mut self, event: &EventInput, now: u64) -> Vec<String> {
        match event.event_type.as_deref() {
            Some("agent_start") => {
                self.state.agent.active = true;
                self.state.agent.starts += 1;
                self.state.agent.last_started_at = Some(now);
                vec!["agent:started".to_owned()]
            }
            Some("agent_end") => {
                self.state.agent.active = false;
                self.state.agent.ends += 1;
                self.state.agent.last_ended_at = Some(now);
                vec!["agent:ended".to_owned()]
            }
            _ => Vec::new(),
        }
    }

    fn reduce_message(&mut self, event: &EventInput) -> Vec<String> {
        let role = event
            .message
            .as_ref()
            .and_then(|message| message.role.clone());
        let role_key = role.clone().unwrap_or_else(|| "unknown".to_owned());
        match event.event_type.as_deref() {
            Some("message_start") => {
                self.state.messages.active_role = role.clone();
                self.state.messages.active_message_id = event
                    .message
                    .as_ref()
                    .and_then(|message| message.id.clone());
                self.state.messages.starts += 1;
                self.state.messages.last_role = role.clone();
                self.role_bucket(&role_key).starts += 1;
                vec![format!("message:{role_key}:started")]
            }
            Some("message_update") => {
                self.state.messages.updates += 1;
                self.state.messages.last_role = role.clone();
                self.role_bucket(&role_key).updates += 1;
                vec![format!("message:{role_key}:updated")]
            }
            Some("message_end") => {
                self.state.messages.ends += 1;
                self.state.messages.last_role = role.clone();
                self.state.messages.last_stop_reason = event
                    .message
                    .as_ref()
                    .and_then(|message| message.stop_reason.clone());
                self.role_bucket(&role_key).ends += 1;
                let message_id = event
                    .message
                    .as_ref()
                    .and_then(|message| message.id.as_deref());
                if self.state.messages.active_message_id.as_deref() == message_id
                    || self.state.messages.active_role == role
                {
                    self.state.messages.active_role = None;
                    self.state.messages.active_message_id = None;
                }
                vec![format!("message:{role_key}:ended")]
            }
            _ => Vec::new(),
        }
    }

    fn reduce_tool(&mut self, event: &EventInput) -> Vec<String> {
        let tool_call_id = event.tool_call_id.clone();
        match event.event_type.as_deref() {
            Some("tool_execution_start") => {
                self.state.tools.starts += 1;
                self.state.tools.last_tool_call_id = tool_call_id.clone();
                self.state.tools.last_tool_name = event.tool_name.clone();
                if let Some(id) = tool_call_id {
                    self.active_tools.insert(
                        id.clone(),
                        ToolActive {
                            id,
                            name: event.tool_name.clone(),
                            updates: 0,
                            started: true,
                        },
                    );
                }
                vec!["tool:started".to_owned()]
            }
            Some("tool_execution_update") => {
                self.state.tools.updates += 1;
                self.state.tools.last_tool_call_id = tool_call_id.clone();
                if let Some(id) = tool_call_id
                    && let Some(active) = self.active_tools.get_mut(&id)
                {
                    active.updates += 1;
                }
                vec!["tool:updated".to_owned()]
            }
            Some("tool_execution_end") => {
                self.state.tools.ends += 1;
                self.state.tools.last_tool_call_id = tool_call_id.clone();
                if event.is_error {
                    self.state.tools.errors += 1;
                }
                if let Some(id) = tool_call_id {
                    self.active_tools.remove(&id);
                }
                vec![if event.is_error {
                    "tool:errored".to_owned()
                } else {
                    "tool:ended".to_owned()
                }]
            }
            _ => Vec::new(),
        }
    }

    fn reduce_stream(&mut self, event: &EventInput) -> Vec<String> {
        match event.event_type.as_deref() {
            Some("agent_start") => {
                self.state.stream.assistant_streaming = false;
                self.state.stream.visible_assistant_text_started = false;
                self.state.stream.message_updates_in_stream = 0;
                self.state.stream.tool_events_in_stream = 0;
                self.state.stream.last_phase = "agent_running".to_owned();
                vec!["stream:agent_started".to_owned()]
            }
            Some("message_start") if message_role(event) == Some("assistant") => {
                self.state.stream.assistant_streaming = true;
                self.state.stream.last_phase = "assistant_started".to_owned();
                vec!["stream:assistant_started".to_owned()]
            }
            Some("message_update") if message_role(event) == Some("assistant") => {
                self.state.stream.assistant_streaming = true;
                self.state.stream.message_updates_in_stream += 1;
                self.state.stream.visible_assistant_text_started |= has_visible_text(event);
                self.state.stream.last_phase = "assistant_streaming".to_owned();
                vec!["stream:assistant_updated".to_owned()]
            }
            Some("message_end") if message_role(event) == Some("assistant") => {
                self.state.stream.assistant_streaming = false;
                self.state.stream.visible_assistant_text_started |= has_visible_text(event);
                self.state.stream.last_phase = "assistant_ended".to_owned();
                vec!["stream:assistant_ended".to_owned()]
            }
            Some(event_type) if event_type.starts_with("tool_execution_") => {
                self.state.stream.tool_events_in_stream += 1;
                self.state.stream.last_phase = if event_type == "tool_execution_end" {
                    "tool_result_handoff".to_owned()
                } else {
                    "tool_activity".to_owned()
                };
                vec![format!("stream:{event_type}")]
            }
            Some("agent_end") => {
                self.state.stream.assistant_streaming = false;
                self.state.stream.last_phase = "idle".to_owned();
                vec!["stream:agent_ended".to_owned()]
            }
            _ => Vec::new(),
        }
    }

    fn resolve_phase(&self, event: &EventInput) -> String {
        match event.event_type.as_deref() {
            Some("agent_end") => "idle".to_owned(),
            Some("compaction_start") => "compacting".to_owned(),
            Some("auto_retry_start") => "retry_waiting".to_owned(),
            _ if !self.active_tools.is_empty() => "tool_active".to_owned(),
            _ if self.state.stream.assistant_streaming => "assistant_streaming".to_owned(),
            _ if self.state.agent.active => "agent_running".to_owned(),
            _ => "idle".to_owned(),
        }
    }

    fn refresh_tool_snapshot(&mut self) {
        self.state.tools.active_count = self.active_tools.len();
        self.state.tools.active = self.active_tools.values().cloned().collect();
    }

    fn role_bucket(&mut self, role: &str) -> &mut RoleBucket {
        self.state
            .messages
            .by_role
            .entry(role.to_owned())
            .or_default()
    }
}

fn message_role(event: &EventInput) -> Option<&str> {
    event
        .message
        .as_ref()
        .and_then(|message| message.role.as_deref())
}

fn has_visible_text(event: &EventInput) -> bool {
    event.message.as_ref().is_some_and(|message| {
        message.parts.iter().any(|part| {
            part.part_type.as_deref() == Some("text")
                && part
                    .text
                    .as_deref()
                    .is_some_and(|text| !text.trim().is_empty())
        })
    })
}

fn event_phase_hint(event: &EventInput) -> String {
    match event.event_type.as_deref() {
        Some("agent_start") => "agent_running".to_owned(),
        Some("agent_end") => "idle".to_owned(),
        Some("message_start") => {
            format!("{}_message_start", message_role(event).unwrap_or("message"))
        }
        Some("message_update") => format!(
            "{}_message_streaming",
            message_role(event).unwrap_or("message")
        ),
        Some("message_end") => format!("{}_message_end", message_role(event).unwrap_or("message")),
        Some("tool_execution_start") => "tool_executing".to_owned(),
        Some("tool_execution_update") => "tool_streaming".to_owned(),
        Some("tool_execution_end") => "tool_finished".to_owned(),
        Some("compaction_start") => "compacting".to_owned(),
        Some("compaction_end") => "compaction_finished".to_owned(),
        Some("auto_retry_start") => "retry_waiting".to_owned(),
        Some("auto_retry_end") => "retry_finished".to_owned(),
        Some(event_type) => event_type.to_owned(),
        None => "unknown".to_owned(),
    }
}
