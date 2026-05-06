use pi_search_core::{
    FdArgsInput, RipgrepArgsInput, TruncateHeadInput, TruncateLineInput, build_fd_args,
    build_ripgrep_args, truncate_head, truncate_line,
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
