use pi_ui_core::{
    ThinkingStatusInput, ToolAttachInput, should_show_thinking_status, tool_should_attach,
};

#[test]
fn tool_attach_requires_new_visible_or_forced_component() {
    assert!(!tool_should_attach(&ToolAttachInput {
        already_attached: true,
        force: true,
        expanded: false,
        execution_started: false,
        args_complete: false,
        has_result: false,
        display_target: String::new(),
    }));

    assert!(tool_should_attach(&ToolAttachInput {
        already_attached: false,
        force: false,
        expanded: false,
        execution_started: false,
        args_complete: false,
        has_result: false,
        display_target: "bash".into(),
    }));
}

#[test]
fn thinking_status_requires_reasoning_and_not_off() {
    assert!(should_show_thinking_status(&ThinkingStatusInput {
        thinking_level: Some("high".into()),
        model_has_reasoning: true,
    }));
    assert!(!should_show_thinking_status(&ThinkingStatusInput {
        thinking_level: Some("off".into()),
        model_has_reasoning: true,
    }));
}
