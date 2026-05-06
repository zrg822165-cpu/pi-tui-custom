use pi_search_core::{
    FdArgsInput, FormatBlockContextInput, FormatFindResultsInput, FormatSingleLineContextInput,
    FormatTextSearchInput, RipgrepArgsInput, TruncateHeadInput, TruncateLineInput, build_fd_args,
    build_ripgrep_args, format_block_context, format_find_results, format_single_line_context,
    format_text_search, truncate_head, truncate_line,
};

#[test]
fn builds_ripgrep_args_with_literal_glob_and_case() {
    assert_eq!(
        build_ripgrep_args(&RipgrepArgsInput {
            pattern: "needle".into(),
            search_path: "src".into(),
            glob: Some("*.rs".into()),
            ignore_case: true,
            literal: true,
        }),
        [
            "--json",
            "--line-number",
            "--color=never",
            "--hidden",
            "--ignore-case",
            "--fixed-strings",
            "--glob",
            "*.rs",
            "--",
            "needle",
            "src"
        ]
    );
}

#[test]
fn builds_fd_full_path_args_for_slash_patterns() {
    assert_eq!(
        build_fd_args(&FdArgsInput {
            pattern: "src/main.rs".into(),
            search_path: ".".into(),
            limit: 10,
        }),
        [
            "--glob",
            "--color=never",
            "--hidden",
            "--no-require-git",
            "--max-results",
            "10",
            "--full-path",
            "--",
            "**/src/main.rs",
            "."
        ]
    );
}

#[test]
fn truncate_head_keeps_complete_lines_by_byte_limit() {
    let result = truncate_head(&TruncateHeadInput {
        content: "abc\ndef\nghi".into(),
        max_lines: Some(99),
        max_bytes: Some(7),
    });

    assert_eq!(result.content, "abc\ndef");
    assert!(result.truncated);
    assert_eq!(result.truncated_by, Some("bytes"));
}

#[test]
fn truncate_line_uses_character_limit() {
    let result = truncate_line(&TruncateLineInput {
        line: "abcdef".into(),
        max_chars: Some(3),
    });

    assert_eq!(result.text, "abc... [truncated]");
    assert!(result.was_truncated);
}

#[test]
fn format_text_search_adds_limit_and_line_notices() {
    let result = format_text_search(&FormatTextSearchInput {
        output_lines: vec!["a:1: hit".into()],
        effective_limit: 1,
        match_limit_reached: true,
        lines_truncated: true,
        default_max_bytes: Some(1024),
        grep_max_line_length: Some(500),
    });

    assert!(result.content.contains("1 matches limit reached"));
    assert!(result.content.contains("Some lines truncated to 500 chars"));
    assert!(result.details.is_some());
}

#[test]
fn format_find_results_reports_empty_results() {
    let result = format_find_results(&FormatFindResultsInput {
        relativized: vec![],
        effective_limit: 10,
        include_refine_notice: true,
        default_max_bytes: Some(1024),
    });

    assert_eq!(result.content, "No files found matching pattern");
    assert!(result.details.is_none());
}

#[test]
fn format_single_line_context_sanitizes_and_truncates() {
    let result = format_single_line_context(&FormatSingleLineContextInput {
        relative_path: "src/main.rs".into(),
        line_number: 3,
        line_text: "abcdef\r\n".into(),
        max_chars: Some(3),
    });

    assert_eq!(result.line, "src/main.rs:3: abc... [truncated]");
    assert!(result.lines_truncated);
}

#[test]
fn format_block_context_marks_surrounding_lines() {
    let result = format_block_context(&FormatBlockContextInput {
        relative_path: "src/main.rs".into(),
        line_number: 2,
        context_value: 1,
        file_lines: vec!["one".into(), "two".into(), "three".into()],
        max_chars: Some(100),
    });

    assert_eq!(
        result.lines,
        [
            "src/main.rs-1- one",
            "src/main.rs:2: two",
            "src/main.rs-3- three"
        ]
    );
    assert!(!result.lines_truncated);
}
