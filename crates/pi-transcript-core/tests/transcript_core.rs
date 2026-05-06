use pi_transcript_core::{
    AssistantStopToolResultInput, CompactionStatusInput, VisibleTranscriptLineBudgetInput,
    assistant_stop_tool_result, compaction_status, visible_transcript_line_budget,
};

#[test]
fn visible_budget_uses_safe_multiplier_and_min_rows() {
    assert_eq!(
        visible_transcript_line_budget(&VisibleTranscriptLineBudgetInput {
            enabled: true,
            terminal_rows: 10,
            multiplier: Some(2.0),
        }),
        Some(48)
    );
}

#[test]
fn compaction_status_pluralizes() {
    assert_eq!(
        compaction_status(&CompactionStatusInput {
            compaction_count: 2,
        }),
        "Session compacted 2 times"
    );
}

#[test]
fn assistant_abort_mentions_retry_attempts() {
    assert_eq!(
        assistant_stop_tool_result(&AssistantStopToolResultInput {
            stop_reason: "aborted".into(),
            retry_attempt: 2,
            error_message: None,
        }),
        "Aborted after 2 retry attempts"
    );
}
