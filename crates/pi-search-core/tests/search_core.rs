use pi_search_core::{
    ContextMatchInput, FdArgsInput, FormatBlockContextInput, FormatContextMatchesInput,
    FormatFindResultsInput, FormatSingleLineContextInput, FormatTextSearchInput,
    ParseRipgrepJsonLineInput, ParseRipgrepJsonLinesInput, RipgrepArgsInput, TruncateHeadInput,
    TruncateLineInput, build_fd_args, build_ripgrep_args, format_block_context,
    format_context_matches, format_find_results, format_single_line_context, format_text_search,
    parse_ripgrep_json_line, parse_ripgrep_json_lines, truncate_head, truncate_line,
};
use std::collections::HashMap;

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

#[test]
fn parse_ripgrep_json_line_extracts_match_event() {
    let result = parse_ripgrep_json_line(&ParseRipgrepJsonLineInput {
        line: r#"{"type":"match","data":{"path":{"text":"src/main.rs"},"line_number":7,"lines":{"text":"fn main()\n"}}}"#.into(),
    });

    assert!(result.is_match_event);
    let matched = result.match_result.expect("expected match fields");
    assert_eq!(matched.file_path, "src/main.rs");
    assert_eq!(matched.line_number, 7);
    assert_eq!(matched.line_text.as_deref(), Some("fn main()\n"));
}

#[test]
fn parse_ripgrep_json_line_ignores_invalid_and_non_match_events() {
    let invalid = parse_ripgrep_json_line(&ParseRipgrepJsonLineInput {
        line: "not json".into(),
    });
    let context = parse_ripgrep_json_line(&ParseRipgrepJsonLineInput {
        line: r#"{"type":"context","data":{"path":{"text":"src/main.rs"}}}"#.into(),
    });

    assert!(!invalid.is_match_event);
    assert!(invalid.match_result.is_none());
    assert!(!context.is_match_event);
    assert!(context.match_result.is_none());
}

#[test]
fn format_context_matches_groups_file_lines_once() {
    let mut file_lines_by_path = HashMap::new();
    file_lines_by_path.insert(
        "src/main.rs".to_owned(),
        vec!["one".into(), "two".into(), "three".into()],
    );
    let result = format_context_matches(&FormatContextMatchesInput {
        matches: vec![
            ContextMatchInput {
                relative_path: "src/main.rs".into(),
                file_path: "src/main.rs".into(),
                line_number: 2,
                line_text: None,
            },
            ContextMatchInput {
                relative_path: "src/main.rs".into(),
                file_path: "src/main.rs".into(),
                line_number: 3,
                line_text: None,
            },
        ],
        context_value: 1,
        file_lines_by_path,
        max_chars: Some(100),
    });

    assert_eq!(result.output_lines.len(), 5);
    assert!(result.output_lines.contains(&"src/main.rs:2: two".into()));
    assert!(!result.lines_truncated);
}

#[test]
fn parse_ripgrep_json_lines_batches_line_parsing() {
    let result = parse_ripgrep_json_lines(&ParseRipgrepJsonLinesInput {
        lines: vec![
            r#"{"type":"match","data":{"path":{"text":"src/main.rs"},"line_number":7}}"#.into(),
            "not json".into(),
        ],
    });

    assert_eq!(result.len(), 2);
    assert!(result[0].is_match_event);
    assert!(!result[1].is_match_event);
}
