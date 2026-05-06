use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    MergeQueues(MergeQueuesInput),
    ClearQueues(ClearQueuesInput),
    BuildRestoreText(RestoreTextInput),
    PlanCompactionFlush(FlushPlanInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    Queues(Queues),
    RestoreText(RestoreText),
    FlushPlan(FlushPlan),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::MergeQueues(input) => OperationResult::Queues(merge_queues(&input)),
        Operation::ClearQueues(input) => OperationResult::Queues(clear_queues(&input)),
        Operation::BuildRestoreText(input) => {
            OperationResult::RestoreText(build_restore_text(&input))
        }
        Operation::PlanCompactionFlush(input) => {
            OperationResult::FlushPlan(plan_compaction_flush(&input))
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedMessage {
    pub text: String,
    pub mode: QueueMode,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum QueueMode {
    #[serde(alias = "steer")]
    Steer,
    #[serde(alias = "followUp")]
    FollowUp,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeQueuesInput {
    #[serde(default)]
    pub session_steering: Vec<String>,
    #[serde(default)]
    pub session_follow_up: Vec<String>,
    #[serde(default)]
    pub compaction_messages: Vec<QueuedMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearQueuesInput {
    #[serde(default)]
    pub cleared_steering: Vec<String>,
    #[serde(default)]
    pub cleared_follow_up: Vec<String>,
    #[serde(default)]
    pub compaction_messages: Vec<QueuedMessage>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Queues {
    pub steering: Vec<String>,
    pub follow_up: Vec<String>,
}

pub fn merge_queues(input: &MergeQueuesInput) -> Queues {
    let mut steering = input.session_steering.clone();
    let mut follow_up = input.session_follow_up.clone();
    append_compaction(&mut steering, &mut follow_up, &input.compaction_messages);
    Queues {
        steering,
        follow_up,
    }
}

pub fn clear_queues(input: &ClearQueuesInput) -> Queues {
    let mut steering = input.cleared_steering.clone();
    let mut follow_up = input.cleared_follow_up.clone();
    append_compaction(&mut steering, &mut follow_up, &input.compaction_messages);
    Queues {
        steering,
        follow_up,
    }
}

fn append_compaction(
    steering: &mut Vec<String>,
    follow_up: &mut Vec<String>,
    messages: &[QueuedMessage],
) {
    for message in messages {
        match message.mode {
            QueueMode::Steer => steering.push(message.text.clone()),
            QueueMode::FollowUp => follow_up.push(message.text.clone()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTextInput {
    #[serde(default)]
    pub steering: Vec<String>,
    #[serde(default)]
    pub follow_up: Vec<String>,
    #[serde(default)]
    pub current_text: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreText {
    pub restored_count: usize,
    pub text: String,
}

pub fn build_restore_text(input: &RestoreTextInput) -> RestoreText {
    let all_queued = input
        .steering
        .iter()
        .chain(input.follow_up.iter())
        .cloned()
        .collect::<Vec<_>>();
    if all_queued.is_empty() {
        return RestoreText {
            restored_count: 0,
            text: input.current_text.clone(),
        };
    }
    let queued_text = all_queued.join("\n\n");
    let text = [queued_text, input.current_text.clone()]
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    RestoreText {
        restored_count: all_queued.len(),
        text,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushPlanInput {
    #[serde(default)]
    pub queued_messages: Vec<QueuedMessage>,
    #[serde(default)]
    pub will_retry: bool,
    #[serde(default)]
    pub extension_command_flags: Vec<bool>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushPlan {
    pub steps: Vec<FlushStep>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushStep {
    pub action: FlushAction,
    pub text: String,
    pub await_before_continue: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FlushAction {
    Prompt,
    FollowUp,
    Steer,
}

pub fn plan_compaction_flush(input: &FlushPlanInput) -> FlushPlan {
    if input.will_retry {
        return FlushPlan {
            steps: input
                .queued_messages
                .iter()
                .enumerate()
                .map(|(index, message)| FlushStep {
                    action: flush_action(message, extension_flag(input, index)),
                    text: message.text.clone(),
                    await_before_continue: true,
                })
                .collect(),
        };
    }

    let first_prompt_index = input
        .queued_messages
        .iter()
        .enumerate()
        .find_map(|(index, _)| (!extension_flag(input, index)).then_some(index));

    let Some(first_prompt_index) = first_prompt_index else {
        return FlushPlan {
            steps: input
                .queued_messages
                .iter()
                .map(|message| FlushStep {
                    action: FlushAction::Prompt,
                    text: message.text.clone(),
                    await_before_continue: true,
                })
                .collect(),
        };
    };

    let steps = input
        .queued_messages
        .iter()
        .enumerate()
        .map(|(index, message)| {
            let is_extension = extension_flag(input, index);
            let action = if index <= first_prompt_index {
                FlushAction::Prompt
            } else {
                flush_action(message, is_extension)
            };
            FlushStep {
                action,
                text: message.text.clone(),
                await_before_continue: index != first_prompt_index,
            }
        })
        .collect();
    FlushPlan { steps }
}

fn flush_action(message: &QueuedMessage, is_extension_command: bool) -> FlushAction {
    if is_extension_command {
        FlushAction::Prompt
    } else if message.mode == QueueMode::FollowUp {
        FlushAction::FollowUp
    } else {
        FlushAction::Steer
    }
}

fn extension_flag(input: &FlushPlanInput, index: usize) -> bool {
    input
        .extension_command_flags
        .get(index)
        .copied()
        .unwrap_or(false)
}
