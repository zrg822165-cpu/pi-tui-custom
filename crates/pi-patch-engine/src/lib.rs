use serde::{Deserialize, Serialize};

const SYNC_START: &str = "\x1b[?2026h";
const SYNC_END: &str = "\x1b[?2026l";

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    FindChangedRange(ChangedRangeInput),
    FindViewportChangedRange(ViewportChangedRangeInput),
    BuildMarkedLinePatch(MarkedLinePatchInput),
    BuildFullRenderPatch(FullRenderPatchInput),
    BuildViewportPatch(ViewportPatchInput),
    BuildDeleteLinesPatch(DeleteLinesPatchInput),
    BuildDiffRenderPatch(DiffRenderPatchInput),
    BuildHardwareCursorPatch(HardwareCursorPatchInput),
    PrepareFrameInput(PrepareFrameInput),
    ComputeLineDiff(ComputeLineDiffInput),
    PlanBeforeDiff(PlanBeforeDiffInput),
    PlanAfterDiff(PlanAfterDiffInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    ChangedRange(ChangedRange),
    ViewportChangedRange(ViewportChangedRange),
    Patch(String),
    DiffPatch(DiffPatch),
    PreparedFrameInput(PreparedFrameInput),
    LineDiff(isize),
    FramePlan(FramePlan),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::FindChangedRange(input) => {
            OperationResult::ChangedRange(find_changed_range(&input))
        }
        Operation::FindViewportChangedRange(input) => {
            OperationResult::ViewportChangedRange(find_viewport_changed_range(&input))
        }
        Operation::BuildMarkedLinePatch(input) => {
            OperationResult::Patch(build_marked_line_patch(&input))
        }
        Operation::BuildFullRenderPatch(input) => {
            OperationResult::Patch(build_full_render_patch(&input))
        }
        Operation::BuildViewportPatch(input) => {
            OperationResult::Patch(build_viewport_patch(&input))
        }
        Operation::BuildDeleteLinesPatch(input) => {
            OperationResult::Patch(build_delete_lines_patch(&input))
        }
        Operation::BuildDiffRenderPatch(input) => {
            OperationResult::DiffPatch(build_diff_render_patch(&input))
        }
        Operation::BuildHardwareCursorPatch(input) => {
            OperationResult::Patch(build_hardware_cursor_patch(&input))
        }
        Operation::PrepareFrameInput(input) => {
            OperationResult::PreparedFrameInput(prepare_frame_input(&input))
        }
        Operation::ComputeLineDiff(input) => {
            OperationResult::LineDiff(compute_frame_line_diff(&input))
        }
        Operation::PlanBeforeDiff(input) => OperationResult::FramePlan(plan_before_diff(&input)),
        Operation::PlanAfterDiff(input) => OperationResult::FramePlan(plan_after_diff(&input)),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedRangeInput {
    pub previous_lines: Vec<String>,
    pub new_lines: Vec<String>,
    pub height: usize,
    pub previous_viewport_top: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedRange {
    pub first_changed: isize,
    pub last_changed: isize,
    pub appended_lines: bool,
    pub append_start: bool,
    pub diff_scanned_lines: usize,
    pub diff_mode: &'static str,
    pub diff_window_start: usize,
}

pub fn find_changed_range(input: &ChangedRangeInput) -> ChangedRange {
    let previous_lines = &input.previous_lines;
    let new_lines = &input.new_lines;
    let height = input.height;
    let previous_viewport_top = input.previous_viewport_top;
    let mut first_changed = -1;
    let mut last_changed = -1;
    let max_lines = new_lines.len().max(previous_lines.len());
    let appended_lines = new_lines.len() > previous_lines.len();
    let tail_window = max_lines.min((height * 4).max(256));
    let tail_start = max_lines.saturating_sub(tail_window);
    let mut diff_window_start = tail_start;
    let mut diff_scanned_lines;
    let diff_mode;

    if appended_lines
        && !previous_lines.is_empty()
        && new_lines.get(previous_lines.len() - 1) == previous_lines.last()
    {
        first_changed = previous_lines.len() as isize;
        last_changed = new_lines.len() as isize - 1;
        diff_scanned_lines = 1;
        diff_mode = "append-fast";
    } else {
        diff_scanned_lines = max_lines - tail_start;
        for i in tail_start..max_lines {
            let old_line = previous_lines.get(i).map_or("", String::as_str);
            let new_line = new_lines.get(i).map_or("", String::as_str);
            if old_line != new_line {
                if first_changed == -1 {
                    first_changed = i as isize;
                }
                last_changed = i as isize;
            }
        }
        if first_changed != -1 {
            diff_mode = "tail-window";
        } else if tail_start <= previous_viewport_top {
            diff_mode = "visible-tail-clean";
        } else if tail_start > 0 {
            diff_mode = "full-scan";
            diff_window_start = 0;
            diff_scanned_lines = max_lines;
            for i in 0..tail_start {
                let old_line = previous_lines.get(i).map_or("", String::as_str);
                let new_line = new_lines.get(i).map_or("", String::as_str);
                if old_line != new_line {
                    if first_changed == -1 {
                        first_changed = i as isize;
                    }
                    last_changed = i as isize;
                }
            }
        } else {
            diff_mode = "full-scan";
        }
    }

    if appended_lines {
        if first_changed == -1 {
            first_changed = previous_lines.len() as isize;
        }
        last_changed = new_lines.len() as isize - 1;
    }

    ChangedRange {
        first_changed,
        last_changed,
        appended_lines,
        append_start: appended_lines
            && first_changed == previous_lines.len() as isize
            && first_changed > 0,
        diff_scanned_lines,
        diff_mode,
        diff_window_start,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportChangedRangeInput {
    pub previous_lines: Vec<String>,
    pub new_lines: Vec<String>,
    pub old_viewport_top: usize,
    pub new_viewport_top: usize,
    pub height: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportChangedRange {
    pub visible_rows: usize,
    pub first_screen_changed: isize,
    pub last_screen_changed: isize,
    pub changed: bool,
}

pub fn find_viewport_changed_range(input: &ViewportChangedRangeInput) -> ViewportChangedRange {
    let available_old = input
        .previous_lines
        .len()
        .saturating_sub(input.old_viewport_top);
    let available_new = input.new_lines.len().saturating_sub(input.new_viewport_top);
    let visible_rows = input.height.min(available_old.max(available_new));
    let mut first_screen_changed = -1;
    let mut last_screen_changed = -1;

    for screen_row in 0..visible_rows {
        let old_line = input
            .previous_lines
            .get(input.old_viewport_top + screen_row)
            .map_or("", String::as_str);
        let new_line = input
            .new_lines
            .get(input.new_viewport_top + screen_row)
            .map_or("", String::as_str);
        if old_line != new_line {
            if first_screen_changed == -1 {
                first_screen_changed = screen_row as isize;
            }
            last_screen_changed = screen_row as isize;
        }
    }

    ViewportChangedRange {
        visible_rows,
        first_screen_changed,
        last_screen_changed,
        changed: first_screen_changed != -1,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkedLinePatchInput {
    pub target_row: isize,
    pub original_row: isize,
    pub original_col: usize,
    pub next_line: String,
}

pub fn build_marked_line_patch(input: &MarkedLinePatchInput) -> String {
    let mut buffer = String::from(SYNC_START);
    push_vertical_move(&mut buffer, input.target_row - input.original_row);
    buffer.push_str("\r\x1b[2K");
    buffer.push_str(&input.next_line);
    push_vertical_move(&mut buffer, input.original_row - input.target_row);
    buffer.push_str(&format!("\x1b[{}G{SYNC_END}", input.original_col + 1));
    buffer
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullRenderPatchInput {
    pub clear: bool,
    pub new_lines: Vec<String>,
}

pub fn build_full_render_patch(input: &FullRenderPatchInput) -> String {
    let mut buffer = String::from(SYNC_START);
    if input.clear {
        buffer.push_str("\x1b[2J\x1b[H\x1b[3J");
    }
    for (index, line) in input.new_lines.iter().enumerate() {
        if index > 0 {
            buffer.push_str("\r\n");
        }
        buffer.push_str(line);
    }
    buffer.push_str(SYNC_END);
    buffer
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportPatchInput {
    pub first_screen_changed: isize,
    pub last_screen_changed: isize,
    pub current_screen_row: isize,
    pub new_viewport_top: usize,
    pub new_lines: Vec<String>,
}

pub fn build_viewport_patch(input: &ViewportPatchInput) -> String {
    let mut buffer = String::from(SYNC_START);
    push_vertical_move(
        &mut buffer,
        input.first_screen_changed - input.current_screen_row,
    );
    for screen_row in input.first_screen_changed..=input.last_screen_changed {
        if screen_row > input.first_screen_changed {
            buffer.push_str("\x1b[1B");
        }
        buffer.push_str("\r\x1b[2K");
        if let Some(line) = input
            .new_lines
            .get(input.new_viewport_top + screen_row as usize)
        {
            buffer.push_str(line);
        }
    }
    buffer.push_str(SYNC_END);
    buffer
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLinesPatchInput {
    pub line_diff: isize,
    pub extra_lines: usize,
}

pub fn build_delete_lines_patch(input: &DeleteLinesPatchInput) -> String {
    let mut buffer = String::from(SYNC_START);
    push_vertical_move(&mut buffer, input.line_diff);
    buffer.push('\r');
    if input.extra_lines > 0 {
        buffer.push_str("\x1b[1B");
    }
    for i in 0..input.extra_lines {
        buffer.push_str("\r\x1b[2K");
        if i < input.extra_lines - 1 {
            buffer.push_str("\x1b[1B");
        }
    }
    if input.extra_lines > 0 {
        buffer.push_str(&format!("\x1b[{}A", input.extra_lines));
    }
    buffer.push_str(SYNC_END);
    buffer
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRenderPatchInput {
    pub first_changed: usize,
    pub render_end: usize,
    pub append_start: bool,
    pub prev_viewport_top: usize,
    pub viewport_top: usize,
    pub hardware_cursor_row: usize,
    pub height: usize,
    pub new_lines: Vec<String>,
    pub previous_line_count: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffPatch {
    pub buffer: String,
    pub final_cursor_row: usize,
    pub prev_viewport_top: usize,
    pub viewport_top: usize,
    pub hardware_cursor_row: usize,
    pub line_diff: isize,
}

pub fn build_diff_render_patch(input: &DiffRenderPatchInput) -> DiffPatch {
    let mut prev_viewport_top = input.prev_viewport_top;
    let mut viewport_top = input.viewport_top;
    let mut hardware_cursor_row = input.hardware_cursor_row;
    let mut buffer = String::from(SYNC_START);
    let prev_viewport_bottom = prev_viewport_top + input.height - 1;
    let move_target_row = if input.append_start {
        input.first_changed - 1
    } else {
        input.first_changed
    };

    if move_target_row > prev_viewport_bottom {
        let current_screen_row = hardware_cursor_row
            .saturating_sub(prev_viewport_top)
            .min(input.height - 1);
        let move_to_bottom = input.height - 1 - current_screen_row;
        if move_to_bottom > 0 {
            buffer.push_str(&format!("\x1b[{move_to_bottom}B"));
        }
        let scroll = move_target_row - prev_viewport_bottom;
        buffer.push_str(&"\r\n".repeat(scroll));
        prev_viewport_top += scroll;
        viewport_top += scroll;
        hardware_cursor_row = move_target_row;
    }

    let line_diff = compute_line_diff(
        move_target_row,
        hardware_cursor_row,
        prev_viewport_top,
        viewport_top,
    );
    push_vertical_move(&mut buffer, line_diff);
    buffer.push_str(if input.append_start { "\r\n" } else { "\r" });

    for i in input.first_changed..=input.render_end {
        if i > input.first_changed {
            buffer.push_str("\r\n");
        }
        buffer.push_str("\x1b[2K");
        if let Some(line) = input.new_lines.get(i) {
            buffer.push_str(line);
        }
    }

    let mut final_cursor_row = input.render_end;
    if input.previous_line_count > input.new_lines.len() {
        if input.render_end < input.new_lines.len() - 1 {
            let move_down = input.new_lines.len() - 1 - input.render_end;
            buffer.push_str(&format!("\x1b[{move_down}B"));
            final_cursor_row = input.new_lines.len() - 1;
        }
        let extra_lines = input.previous_line_count - input.new_lines.len();
        for _ in input.new_lines.len()..input.previous_line_count {
            buffer.push_str("\r\n\x1b[2K");
        }
        buffer.push_str(&format!("\x1b[{extra_lines}A"));
    }
    buffer.push_str(SYNC_END);

    DiffPatch {
        buffer,
        final_cursor_row,
        prev_viewport_top,
        viewport_top,
        hardware_cursor_row,
        line_diff,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareCursorPatchInput {
    pub current_row: isize,
    pub target_row: isize,
    pub target_col: usize,
}

pub fn build_hardware_cursor_patch(input: &HardwareCursorPatchInput) -> String {
    let mut buffer = String::new();
    push_vertical_move(&mut buffer, input.target_row - input.current_row);
    buffer.push_str(&format!("\x1b[{}G", input.target_col + 1));
    buffer
}

fn push_vertical_move(buffer: &mut String, row_delta: isize) {
    if row_delta > 0 {
        buffer.push_str(&format!("\x1b[{row_delta}B"));
    } else if row_delta < 0 {
        buffer.push_str(&format!("\x1b[{}A", -row_delta));
    }
}

fn compute_line_diff(
    target_row: usize,
    hardware_cursor_row: usize,
    prev_viewport_top: usize,
    viewport_top: usize,
) -> isize {
    let current_screen_row = hardware_cursor_row as isize - prev_viewport_top as isize;
    let target_screen_row = target_row as isize - viewport_top as isize;
    target_screen_row - current_screen_row
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareFrameInput {
    pub terminal_width: usize,
    pub terminal_height: usize,
    pub previous_width: usize,
    pub previous_height: usize,
    pub previous_viewport_top: usize,
    pub hardware_cursor_row: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedFrameInput {
    pub width: usize,
    pub height: usize,
    pub width_changed: bool,
    pub height_changed: bool,
    pub previous_buffer_length: usize,
    pub prev_viewport_top: usize,
    pub viewport_top: usize,
    pub hardware_cursor_row: usize,
}

pub fn prepare_frame_input(input: &PrepareFrameInput) -> PreparedFrameInput {
    let width_changed = input.previous_width != 0 && input.previous_width != input.terminal_width;
    let height_changed =
        input.previous_height != 0 && input.previous_height != input.terminal_height;
    let previous_buffer_length = if input.previous_height > 0 {
        input.previous_viewport_top + input.previous_height
    } else {
        input.terminal_height
    };
    let prev_viewport_top = if height_changed {
        previous_buffer_length.saturating_sub(input.terminal_height)
    } else {
        input.previous_viewport_top
    };
    let viewport_top = prev_viewport_top;

    PreparedFrameInput {
        width: input.terminal_width,
        height: input.terminal_height,
        width_changed,
        height_changed,
        previous_buffer_length,
        prev_viewport_top,
        viewport_top,
        hardware_cursor_row: input.hardware_cursor_row,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeLineDiffInput {
    pub target_row: isize,
    pub hardware_cursor_row: isize,
    pub prev_viewport_top: isize,
    pub viewport_top: isize,
}

pub fn compute_frame_line_diff(input: &ComputeLineDiffInput) -> isize {
    let current_screen_row = input.hardware_cursor_row - input.prev_viewport_top;
    let target_screen_row = input.target_row - input.viewport_top;
    target_screen_row - current_screen_row
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanBeforeDiffInput {
    pub previous_line_count: usize,
    pub width_changed: bool,
    pub height_changed: bool,
    pub is_termux: bool,
    pub clear_on_shrink: bool,
    pub new_line_count: usize,
    pub max_lines_rendered: usize,
    pub has_overlays: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanAfterDiffInput {
    pub first_changed: isize,
    pub new_line_count: usize,
    pub previous_line_count: usize,
    pub previous_viewport_top: usize,
    pub height: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePlan {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clear: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_kind: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_viewport_top: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_line_count: Option<usize>,
}

pub fn plan_before_diff(input: &PlanBeforeDiffInput) -> FramePlan {
    if input.previous_line_count == 0 && !input.width_changed && !input.height_changed {
        return FramePlan {
            kind: "fullRender",
            clear: Some(false),
            reason: Some("first render"),
            timing_kind: Some("fullRender"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    if input.width_changed {
        return FramePlan {
            kind: "fullRender",
            clear: Some(true),
            reason: Some("terminal width changed"),
            timing_kind: Some("fullRenderClear"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    if input.height_changed && !input.is_termux {
        return FramePlan {
            kind: "fullRender",
            clear: Some(true),
            reason: Some("terminal height changed"),
            timing_kind: Some("fullRenderClear"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    if input.clear_on_shrink
        && input.new_line_count < input.max_lines_rendered
        && !input.has_overlays
    {
        return FramePlan {
            kind: "fullRender",
            clear: Some(true),
            reason: Some("clearOnShrink"),
            timing_kind: Some("fullRenderClear"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    FramePlan {
        kind: "diff",
        clear: None,
        reason: None,
        timing_kind: None,
        new_viewport_top: None,
        previous_line_count: None,
    }
}

pub fn plan_after_diff(input: &PlanAfterDiffInput) -> FramePlan {
    if input.first_changed == -1 {
        return FramePlan {
            kind: "noChange",
            clear: None,
            reason: None,
            timing_kind: Some("noChange"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    if input.first_changed >= input.new_line_count as isize {
        return FramePlan {
            kind: "deleteLines",
            clear: None,
            reason: None,
            timing_kind: Some("deleteLines"),
            new_viewport_top: None,
            previous_line_count: None,
        };
    }
    if input.first_changed < input.previous_viewport_top as isize {
        return FramePlan {
            kind: "viewportPatch",
            clear: None,
            reason: Some("viewport-local"),
            timing_kind: None,
            new_viewport_top: Some(input.new_line_count.saturating_sub(input.height)),
            previous_line_count: None,
        };
    }
    FramePlan {
        kind: "diffRender",
        clear: None,
        reason: None,
        timing_kind: Some("diffRender"),
        new_viewport_top: None,
        previous_line_count: Some(input.previous_line_count),
    }
}
