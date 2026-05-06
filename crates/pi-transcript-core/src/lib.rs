use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    VisibleTranscriptLineBudget(VisibleTranscriptLineBudgetInput),
    UserMessageText(MessageInput),
    MessageHasVisibleText(MessageInput),
    MessageHasToolCall(MessageInput),
    CompactionStatus(CompactionStatusInput),
    AssistantStopToolResult(AssistantStopToolResultInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    Budget(Option<usize>),
    Text(String),
    Bool(bool),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::VisibleTranscriptLineBudget(input) => {
            OperationResult::Budget(visible_transcript_line_budget(&input))
        }
        Operation::UserMessageText(input) => OperationResult::Text(user_message_text(&input)),
        Operation::MessageHasVisibleText(input) => {
            OperationResult::Bool(message_has_visible_text(&input))
        }
        Operation::MessageHasToolCall(input) => {
            OperationResult::Bool(message_has_tool_call(&input))
        }
        Operation::CompactionStatus(input) => OperationResult::Text(compaction_status(&input)),
        Operation::AssistantStopToolResult(input) => {
            OperationResult::Text(assistant_stop_tool_result(&input))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibleTranscriptLineBudgetInput {
    pub enabled: bool,
    pub terminal_rows: usize,
    #[serde(default)]
    pub multiplier: Option<f64>,
}

pub fn visible_transcript_line_budget(input: &VisibleTranscriptLineBudgetInput) -> Option<usize> {
    if !input.enabled {
        return None;
    }
    let rows = input.terminal_rows.max(24);
    let multiplier = input.multiplier.unwrap_or(4.0);
    let safe_multiplier = if multiplier.is_finite() && multiplier > 0.0 {
        multiplier
    } else {
        4.0
    };
    Some(rows.max((rows as f64 * safe_multiplier).ceil() as usize))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput {
    pub role: String,
    #[serde(default)]
    pub content: MessageContent,
}

#[derive(Debug, Default, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
    #[default]
    Empty,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(default)]
    pub text: Option<String>,
}

pub fn user_message_text(message: &MessageInput) -> String {
    if message.role != "user" {
        return String::new();
    }
    match &message.content {
        MessageContent::Text(text) => text.clone(),
        MessageContent::Blocks(blocks) => blocks
            .iter()
            .filter(|block| block.block_type == "text")
            .filter_map(|block| block.text.as_deref())
            .collect::<Vec<_>>()
            .join(""),
        MessageContent::Empty => String::new(),
    }
}

pub fn message_has_visible_text(message: &MessageInput) -> bool {
    match &message.content {
        MessageContent::Blocks(blocks) => blocks.iter().any(|block| {
            block.block_type == "text"
                && block
                    .text
                    .as_deref()
                    .is_some_and(|text| !text.trim().is_empty())
        }),
        MessageContent::Text(text) => !text.trim().is_empty(),
        MessageContent::Empty => false,
    }
}

pub fn message_has_tool_call(message: &MessageInput) -> bool {
    matches!(
        &message.content,
        MessageContent::Blocks(blocks) if blocks.iter().any(|block| block.block_type == "toolCall")
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionStatusInput {
    pub compaction_count: usize,
}

pub fn compaction_status(input: &CompactionStatusInput) -> String {
    let times = if input.compaction_count == 1 {
        "1 time".to_owned()
    } else {
        format!("{} times", input.compaction_count)
    };
    format!("Session compacted {times}")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStopToolResultInput {
    pub stop_reason: String,
    #[serde(default)]
    pub retry_attempt: usize,
    #[serde(default)]
    pub error_message: Option<String>,
}

pub fn assistant_stop_tool_result(input: &AssistantStopToolResultInput) -> String {
    if input.stop_reason == "aborted" {
        if input.retry_attempt > 0 {
            format!(
                "Aborted after {} retry attempt{}",
                input.retry_attempt,
                if input.retry_attempt > 1 { "s" } else { "" }
            )
        } else {
            "Operation aborted".to_owned()
        }
    } else {
        input
            .error_message
            .clone()
            .unwrap_or_else(|| "Error".to_owned())
    }
}
