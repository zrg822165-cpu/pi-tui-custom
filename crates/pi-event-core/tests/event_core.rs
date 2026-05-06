use pi_event_core::{EventInput, EventPlanInput, MessageInput, SnapshotInput, plan_event_actions};

#[test]
fn assistant_message_start_requests_streaming_plan() {
    let plan = plan_event_actions(&EventPlanInput {
        event: EventInput {
            event_type: Some("message_start".into()),
            message: Some(MessageInput {
                id: Some("m1".into()),
                role: Some("assistant".into()),
                stop_reason: None,
            }),
            tool_call_id: None,
            tool_name: None,
            is_error: false,
        },
        snapshot: SnapshotInput {
            phase: Some("agent_running".into()),
        },
    });

    assert_eq!(plan.event_group, "message");
    assert!(plan.render.request);
    assert_eq!(
        plan.render.reason.as_deref(),
        Some("assistant_message_start")
    );
    assert_eq!(
        plan.transcript.streaming_assistant.as_deref(),
        Some("start")
    );
}

#[test]
fn aborted_assistant_end_clears_pending_tools() {
    let plan = plan_event_actions(&EventPlanInput {
        event: EventInput {
            event_type: Some("message_end".into()),
            message: Some(MessageInput {
                id: Some("m1".into()),
                role: Some("assistant".into()),
                stop_reason: Some("aborted".into()),
            }),
            tool_call_id: None,
            tool_name: None,
            is_error: false,
        },
        snapshot: SnapshotInput::default(),
    });

    assert!(plan.tool.clear_pending);
    assert!(
        plan.actions
            .contains(&"tools:mark_pending_error".to_owned())
    );
}
