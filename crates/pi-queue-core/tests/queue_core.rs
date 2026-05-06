use pi_queue_core::{
    FlushAction, FlushPlanInput, MergeQueuesInput, QueueMode, QueuedMessage, RestoreTextInput,
    build_restore_text, merge_queues, plan_compaction_flush,
};

#[test]
fn merge_queues_preserves_session_then_compaction_order() {
    let queues = merge_queues(&MergeQueuesInput {
        session_steering: vec!["s1".into()],
        session_follow_up: vec!["f1".into()],
        compaction_messages: vec![
            QueuedMessage {
                text: "s2".into(),
                mode: QueueMode::Steer,
            },
            QueuedMessage {
                text: "f2".into(),
                mode: QueueMode::FollowUp,
            },
        ],
    });

    assert_eq!(queues.steering, ["s1", "s2"]);
    assert_eq!(queues.follow_up, ["f1", "f2"]);
}

#[test]
fn restore_text_joins_queued_messages_before_editor_text() {
    let restored = build_restore_text(&RestoreTextInput {
        steering: vec!["steer".into()],
        follow_up: vec!["follow".into()],
        current_text: "current".into(),
    });

    assert_eq!(restored.restored_count, 2);
    assert_eq!(restored.text, "steer\n\nfollow\n\ncurrent");
}

#[test]
fn flush_plan_keeps_first_prompt_unawaited_then_routes_rest() {
    let plan = plan_compaction_flush(&FlushPlanInput {
        queued_messages: vec![
            QueuedMessage {
                text: "/cmd".into(),
                mode: QueueMode::Steer,
            },
            QueuedMessage {
                text: "ask".into(),
                mode: QueueMode::FollowUp,
            },
            QueuedMessage {
                text: "next".into(),
                mode: QueueMode::FollowUp,
            },
        ],
        will_retry: false,
        extension_command_flags: vec![true, false, false],
    });

    assert_eq!(plan.steps[0].action, FlushAction::Prompt);
    assert!(plan.steps[0].await_before_continue);
    assert_eq!(plan.steps[1].action, FlushAction::Prompt);
    assert!(!plan.steps[1].await_before_continue);
    assert_eq!(plan.steps[2].action, FlushAction::FollowUp);
    assert!(plan.steps[2].await_before_continue);
}
