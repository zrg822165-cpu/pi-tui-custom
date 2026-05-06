use pi_patch_engine::{
    ChangedRangeInput, DeleteLinesPatchInput, FullRenderPatchInput, HardwareCursorPatchInput,
    build_delete_lines_patch, build_full_render_patch, build_hardware_cursor_patch,
    find_changed_range,
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
