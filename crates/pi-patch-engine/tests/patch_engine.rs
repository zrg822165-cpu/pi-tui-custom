use pi_patch_engine::{
    ChangedRangeInput, DeleteLinesPatchInput, FullRenderPatchInput, HardwareCursorPatchInput,
    PlanAfterDiffInput, PlanBeforeDiffInput, PrepareFrameInput, build_delete_lines_patch,
    build_full_render_patch, build_hardware_cursor_patch, find_changed_range, plan_after_diff,
    plan_before_diff, prepare_frame_input,
};

#[test]
fn changed_range_uses_append_fast_path() {
    let range = find_changed_range(&ChangedRangeInput {
        previous_lines: vec!["a".into(), "b".into()],
        new_lines: vec!["a".into(), "b".into(), "c".into()],
        height: 20,
        previous_viewport_top: 0,
    });

    assert_eq!(range.first_changed, 2);
    assert_eq!(range.last_changed, 2);
    assert!(range.appended_lines);
    assert!(range.append_start);
    assert_eq!(range.diff_mode, "append-fast");
}

#[test]
fn full_render_patch_matches_js_protocol() {
    assert_eq!(
        build_full_render_patch(&FullRenderPatchInput {
            clear: true,
            new_lines: vec!["one".into(), "two".into()],
        }),
        "\x1b[?2026h\x1b[2J\x1b[H\x1b[3Jone\r\ntwo\x1b[?2026l"
    );
}

#[test]
fn delete_lines_patch_clears_extra_rows() {
    assert_eq!(
        build_delete_lines_patch(&DeleteLinesPatchInput {
            line_diff: 2,
            extra_lines: 2,
        }),
        "\x1b[?2026h\x1b[2B\r\x1b[1B\r\x1b[2K\x1b[1B\r\x1b[2K\x1b[2A\x1b[?2026l"
    );
}

#[test]
fn hardware_cursor_patch_moves_and_sets_column() {
    assert_eq!(
        build_hardware_cursor_patch(&HardwareCursorPatchInput {
            current_row: 5,
            target_row: 3,
            target_col: 7,
        }),
        "\x1b[2A\x1b[8G"
    );
}

#[test]
fn frame_input_rebases_viewport_on_height_change() {
    let prepared = prepare_frame_input(&PrepareFrameInput {
        terminal_width: 100,
        terminal_height: 20,
        previous_width: 100,
        previous_height: 30,
        previous_viewport_top: 10,
        hardware_cursor_row: 25,
    });

    assert!(prepared.height_changed);
    assert_eq!(prepared.previous_buffer_length, 40);
    assert_eq!(prepared.prev_viewport_top, 20);
    assert_eq!(prepared.viewport_top, 20);
}

#[test]
fn planner_selects_clear_on_width_change() {
    let plan = plan_before_diff(&PlanBeforeDiffInput {
        previous_line_count: 5,
        width_changed: true,
        height_changed: false,
        is_termux: false,
        clear_on_shrink: false,
        new_line_count: 5,
        max_lines_rendered: 5,
        has_overlays: false,
    });

    assert_eq!(plan.kind, "fullRender");
    assert_eq!(plan.clear, Some(true));
    assert_eq!(plan.reason, Some("terminal width changed"));
}

#[test]
fn planner_selects_viewport_patch_for_change_above_viewport() {
    let plan = plan_after_diff(&PlanAfterDiffInput {
        first_changed: 2,
        new_line_count: 50,
        previous_line_count: 50,
        previous_viewport_top: 10,
        height: 20,
    });

    assert_eq!(plan.kind, "viewportPatch");
    assert_eq!(plan.new_viewport_top, Some(30));
    assert_eq!(plan.reason, Some("viewport-local"));
}
