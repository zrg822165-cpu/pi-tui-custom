use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    ToolShouldAttach(ToolAttachInput),
    StartupExpansion(StartupExpansionInput),
    ShouldShowThinkingStatus(ThinkingStatusInput),
    WorkingLoaderMessage(WorkingLoaderMessageInput),
    NoticeText(NoticeTextInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    Bool(bool),
    Text(String),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::ToolShouldAttach(input) => OperationResult::Bool(tool_should_attach(&input)),
        Operation::StartupExpansion(input) => OperationResult::Bool(startup_expansion(&input)),
        Operation::ShouldShowThinkingStatus(input) => {
            OperationResult::Bool(should_show_thinking_status(&input))
        }
        Operation::WorkingLoaderMessage(input) => {
            OperationResult::Text(working_loader_message(&input))
        }
        Operation::NoticeText(input) => OperationResult::Text(notice_text(&input)),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAttachInput {
    pub already_attached: bool,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub expanded: bool,
    #[serde(default)]
    pub execution_started: bool,
    #[serde(default)]
    pub args_complete: bool,
    #[serde(default)]
    pub has_result: bool,
    #[serde(default)]
    pub display_target: String,
}

pub fn tool_should_attach(input: &ToolAttachInput) -> bool {
    if input.already_attached {
        return false;
    }
    input.force
        || input.expanded
        || input.execution_started
        || input.args_complete
        || input.has_result
        || !input.display_target.is_empty()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupExpansionInput {
    pub verbose: bool,
    pub tool_output_expanded: bool,
}

pub fn startup_expansion(input: &StartupExpansionInput) -> bool {
    input.verbose || input.tool_output_expanded
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingStatusInput {
    #[serde(default)]
    pub thinking_level: Option<String>,
    #[serde(default)]
    pub model_has_reasoning: bool,
}

pub fn should_show_thinking_status(input: &ThinkingStatusInput) -> bool {
    input.thinking_level.as_deref() != Some("off") && input.model_has_reasoning
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLoaderMessageInput {
    #[serde(default)]
    pub working_message: Option<String>,
    pub default_working_message: String,
}

pub fn working_loader_message(input: &WorkingLoaderMessageInput) -> String {
    input
        .working_message
        .clone()
        .unwrap_or_else(|| input.default_working_message.clone())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticeTextInput {
    pub kind: NoticeKind,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoticeKind {
    SessionName,
    SessionNameSet,
    NewSessionStarted,
    DebugLogWritten,
}

pub fn notice_text(input: &NoticeTextInput) -> String {
    match input.kind {
        NoticeKind::SessionName => format!(
            "Session name: {}",
            input.value.as_deref().unwrap_or_default()
        ),
        NoticeKind::SessionNameSet => {
            format!(
                "Session name set: {}",
                input.value.as_deref().unwrap_or_default()
            )
        }
        NoticeKind::NewSessionStarted => "✓ New session started".to_owned(),
        NoticeKind::DebugLogWritten => {
            format!(
                "✓ Debug log written\n{}",
                input.value.as_deref().unwrap_or_default()
            )
        }
    }
}
