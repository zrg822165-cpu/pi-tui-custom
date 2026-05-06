use pi_event_core::{
    EventInput, EventPlanInput, EventSequenceInput, MessageInput, MessagePartInput, SnapshotInput,
    apply_event_sequence, plan_event_actions,
};

#[test]
fn assistant_message_start_requests_streaming_plan() {
    let plan = plan_event_actions(&EventPlanInput {
        event: EventInput {
            event_type: Some("message_start".into()),
            message: Some(MessageInput {
                id: Some("m1".into()),
                role: Some("assistant".into()),
                stop_reason: None,
                parts: vec![],
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
                parts: vec![],
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

#[test]
fn event_sequence_tracks_stream_and_tool_phases() {
    let transitions = apply_event_sequence(&EventSequenceInput {
        start_now: 100,
        now_step: 10,
        events: vec![
            EventInput {
                event_type: Some("agent_start".into()),
                message: None,
                tool_call_id: None,
                tool_name: None,
                is_error: false,
            },
            EventInput {
                event_type: Some("message_start".into()),
                message: Some(MessageInput {
                    id: Some("a1".into()),
                    role: Some("assistant".into()),
                    stop_reason: None,
                    parts: vec![],
                }),
                tool_call_id: None,
                tool_name: None,
                is_error: false,
            },
            EventInput {
                event_type: Some("message_update".into()),
                message: Some(MessageInput {
                    id: Some("a1".into()),
                    role: Some("assistant".into()),
                    stop_reason: None,
                    parts: vec![MessagePartInput {
                        part_type: Some("text".into()),
                        text: Some("hello".into()),
                    }],
                }),
                tool_call_id: None,
                tool_name: None,
                is_error: false,
            },
            EventInput {
                event_type: Some("tool_execution_start".into()),
                message: None,
                tool_call_id: Some("t1".into()),
                tool_name: Some("bash".into()),
                is_error: false,
            },
        ],
    });

    assert_eq!(transitions[0].snapshot.agent.last_started_at, Some(100));
    assert_eq!(transitions[1].phase, "assistant_streaming");
    assert!(
        transitions[2]
            .snapshot
            .stream
            .visible_assistant_text_started
    );
    assert_eq!(transitions[3].phase, "tool_active");
    assert_eq!(transitions[3].snapshot.tools.active_count, 1);
}
