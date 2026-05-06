use serde::{Deserialize, Serialize};

pub const DEFAULT_MAX_LINES: usize = 2000;
pub const DEFAULT_MAX_BYTES: usize = 50 * 1024;
pub const GREP_MAX_LINE_LENGTH: usize = 500;
pub const JS_MAX_SAFE_INTEGER: usize = 9_007_199_254_740_991;

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    BuildRipgrepArgs(RipgrepArgsInput),
    BuildFdArgs(FdArgsInput),
    TruncateHead(TruncateHeadInput),
    TruncateLine(TruncateLineInput),
    FormatSize(FormatSizeInput),
    FormatTextSearch(FormatTextSearchInput),
    FormatFindResults(FormatFindResultsInput),
    FormatDirectoryResults(FormatDirectoryResultsInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    Args(Vec<String>),
    Truncation(Truncation),
    TruncatedLine(TruncatedLine),
    Text(String),
    FormattedOutput(FormattedOutput),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::BuildRipgrepArgs(input) => OperationResult::Args(build_ripgrep_args(&input)),
        Operation::BuildFdArgs(input) => OperationResult::Args(build_fd_args(&input)),
        Operation::TruncateHead(input) => OperationResult::Truncation(truncate_head(&input)),
        Operation::TruncateLine(input) => OperationResult::TruncatedLine(truncate_line(&input)),
        Operation::FormatSize(input) => OperationResult::Text(format_size(input.bytes)),
        Operation::FormatTextSearch(input) => {
            OperationResult::FormattedOutput(format_text_search(&input))
        }
        Operation::FormatFindResults(input) => {
            OperationResult::FormattedOutput(format_find_results(&input))
        }
        Operation::FormatDirectoryResults(input) => {
            OperationResult::FormattedOutput(format_directory_results(&input))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RipgrepArgsInput {
    pub pattern: String,
    pub search_path: String,
    #[serde(default)]
    pub glob: Option<String>,
    #[serde(default)]
    pub ignore_case: bool,
    #[serde(default)]
    pub literal: bool,
}

pub fn build_ripgrep_args(input: &RipgrepArgsInput) -> Vec<String> {
    let mut args = vec![
        "--json".to_owned(),
        "--line-number".to_owned(),
        "--color=never".to_owned(),
        "--hidden".to_owned(),
    ];
    if input.ignore_case {
        args.push("--ignore-case".to_owned());
    }
    if input.literal {
        args.push("--fixed-strings".to_owned());
    }
    if let Some(glob) = input.glob.as_deref() {
        args.push("--glob".to_owned());
        args.push(glob.to_owned());
    }
    args.push("--".to_owned());
    args.push(input.pattern.clone());
    args.push(input.search_path.clone());
    args
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FdArgsInput {
    pub pattern: String,
    pub search_path: String,
    pub limit: usize,
}

pub fn build_fd_args(input: &FdArgsInput) -> Vec<String> {
    let mut args = vec![
        "--glob".to_owned(),
        "--color=never".to_owned(),
        "--hidden".to_owned(),
        "--no-require-git".to_owned(),
        "--max-results".to_owned(),
        input.limit.to_string(),
    ];
    let mut effective_pattern = input.pattern.clone();
    if input.pattern.contains('/') {
        args.push("--full-path".to_owned());
        if !input.pattern.starts_with('/')
            && !input.pattern.starts_with("**/")
            && input.pattern != "**"
        {
            effective_pattern = format!("**/{}", input.pattern);
        }
    }
    args.push("--".to_owned());
    args.push(effective_pattern);
    args.push(input.search_path.clone());
    args
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TruncateHeadInput {
    pub content: String,
    #[serde(default)]
    pub max_lines: Option<usize>,
    #[serde(default)]
    pub max_bytes: Option<usize>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Truncation {
    pub content: String,
    pub truncated: bool,
    pub truncated_by: Option<&'static str>,
    pub total_lines: usize,
    pub total_bytes: usize,
    pub output_lines: usize,
    pub output_bytes: usize,
    pub last_line_partial: bool,
    pub first_line_exceeds_limit: bool,
    pub max_lines: usize,
    pub max_bytes: usize,
}

pub fn truncate_head(input: &TruncateHeadInput) -> Truncation {
    let max_lines = input.max_lines.unwrap_or(DEFAULT_MAX_LINES);
    let max_bytes = input.max_bytes.unwrap_or(DEFAULT_MAX_BYTES);
    let total_bytes = input.content.len();
    let lines: Vec<&str> = input.content.split('\n').collect();
    let total_lines = lines.len();

    if total_lines <= max_lines && total_bytes <= max_bytes {
        return Truncation {
            content: input.content.clone(),
            truncated: false,
            truncated_by: None,
            total_lines,
            total_bytes,
            output_lines: total_lines,
            output_bytes: total_bytes,
            last_line_partial: false,
            first_line_exceeds_limit: false,
            max_lines,
            max_bytes,
        };
    }

    let first_line_bytes = lines.first().map_or(0, |line| line.len());
    if first_line_bytes > max_bytes {
        return Truncation {
            content: String::new(),
            truncated: true,
            truncated_by: Some("bytes"),
            total_lines,
            total_bytes,
            output_lines: 0,
            output_bytes: 0,
            last_line_partial: false,
            first_line_exceeds_limit: true,
            max_lines,
            max_bytes,
        };
    }

    let mut output_lines = Vec::new();
    let mut output_bytes_count = 0;
    let mut truncated_by = "lines";
    for (index, line) in lines.iter().take(max_lines).enumerate() {
        let line_bytes = line.len() + usize::from(index > 0);
        if output_bytes_count + line_bytes > max_bytes {
            truncated_by = "bytes";
            break;
        }
        output_lines.push(*line);
        output_bytes_count += line_bytes;
    }
    if output_lines.len() >= max_lines && output_bytes_count <= max_bytes {
        truncated_by = "lines";
    }
    let content = output_lines.join("\n");
    let output_bytes = content.len();

    Truncation {
        content,
        truncated: true,
        truncated_by: Some(truncated_by),
        total_lines,
        total_bytes,
        output_lines: output_lines.len(),
        output_bytes,
        last_line_partial: false,
        first_line_exceeds_limit: false,
        max_lines,
        max_bytes,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TruncateLineInput {
    pub line: String,
    #[serde(default)]
    pub max_chars: Option<usize>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TruncatedLine {
    pub text: String,
    pub was_truncated: bool,
}

pub fn truncate_line(input: &TruncateLineInput) -> TruncatedLine {
    let max_chars = input.max_chars.unwrap_or(GREP_MAX_LINE_LENGTH);
    let char_count = input.line.chars().count();
    if char_count <= max_chars {
        return TruncatedLine {
            text: input.line.clone(),
            was_truncated: false,
        };
    }
    let text: String = input.line.chars().take(max_chars).collect();
    TruncatedLine {
        text: format!("{text}... [truncated]"),
        was_truncated: true,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSizeInput {
    pub bytes: usize,
}

pub fn format_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes}B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatTextSearchInput {
    pub output_lines: Vec<String>,
    pub effective_limit: usize,
    pub match_limit_reached: bool,
    pub lines_truncated: bool,
    #[serde(default)]
    pub default_max_bytes: Option<usize>,
    #[serde(default)]
    pub grep_max_line_length: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatFindResultsInput {
    pub relativized: Vec<String>,
    pub effective_limit: usize,
    pub include_refine_notice: bool,
    #[serde(default)]
    pub default_max_bytes: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatDirectoryResultsInput {
    pub results: Vec<String>,
    pub limit: usize,
    pub entry_limit_reached: bool,
    #[serde(default)]
    pub default_max_bytes: Option<usize>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormattedOutput {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

pub fn format_text_search(input: &FormatTextSearchInput) -> FormattedOutput {
    let raw_output = input.output_lines.join("\n");
    let truncation = truncate_formatter_output(&raw_output, input.default_max_bytes);
    let mut output = truncation.content.clone();
    let mut details = serde_json::Map::new();
    let mut notices = Vec::new();

    if input.match_limit_reached {
        notices.push(format!(
            "{} matches limit reached. Use limit={} for more, or refine pattern",
            input.effective_limit,
            input.effective_limit * 2
        ));
        details.insert(
            "matchLimitReached".to_owned(),
            serde_json::json!(input.effective_limit),
        );
    }
    if truncation.truncated {
        notices.push(format!(
            "{} limit reached",
            max_bytes_label(input.default_max_bytes)
        ));
        details.insert("truncation".to_owned(), serde_json::json!(truncation));
    }
    if input.lines_truncated {
        notices.push(format!(
            "Some lines truncated to {} chars. Use read tool to see full lines",
            input.grep_max_line_length.unwrap_or(GREP_MAX_LINE_LENGTH)
        ));
        details.insert("linesTruncated".to_owned(), serde_json::json!(true));
    }
    append_notices(&mut output, &notices);
    formatted(output, details)
}

pub fn format_find_results(input: &FormatFindResultsInput) -> FormattedOutput {
    if input.relativized.is_empty() {
        return FormattedOutput {
            content: "No files found matching pattern".to_owned(),
            details: None,
        };
    }

    let result_limit_reached = input.relativized.len() >= input.effective_limit;
    let raw_output = input.relativized.join("\n");
    let truncation = truncate_formatter_output(&raw_output, input.default_max_bytes);
    let mut output = truncation.content.clone();
    let mut details = serde_json::Map::new();
    let mut notices = Vec::new();

    if result_limit_reached {
        let suffix = if input.include_refine_notice {
            format!(
                ". Use limit={} for more, or refine pattern",
                input.effective_limit * 2
            )
        } else {
            String::new()
        };
        notices.push(format!(
            "{} results limit reached{}",
            input.effective_limit, suffix
        ));
        details.insert(
            "resultLimitReached".to_owned(),
            serde_json::json!(input.effective_limit),
        );
    }
    if truncation.truncated {
        notices.push(format!(
            "{} limit reached",
            max_bytes_label(input.default_max_bytes)
        ));
        details.insert("truncation".to_owned(), serde_json::json!(truncation));
    }
    append_notices(&mut output, &notices);
    formatted(output, details)
}

pub fn format_directory_results(input: &FormatDirectoryResultsInput) -> FormattedOutput {
    if input.results.is_empty() {
        return FormattedOutput {
            content: "(empty directory)".to_owned(),
            details: None,
        };
    }

    let raw_output = input.results.join("\n");
    let truncation = truncate_formatter_output(&raw_output, input.default_max_bytes);
    let mut output = truncation.content.clone();
    let mut details = serde_json::Map::new();
    let mut notices = Vec::new();

    if input.entry_limit_reached {
        notices.push(format!(
            "{} entries limit reached. Use limit={} for more",
            input.limit,
            input.limit * 2
        ));
        details.insert(
            "entryLimitReached".to_owned(),
            serde_json::json!(input.limit),
        );
    }
    if truncation.truncated {
        notices.push(format!(
            "{} limit reached",
            max_bytes_label(input.default_max_bytes)
        ));
        details.insert("truncation".to_owned(), serde_json::json!(truncation));
    }
    append_notices(&mut output, &notices);
    formatted(output, details)
}

fn truncate_formatter_output(raw_output: &str, default_max_bytes: Option<usize>) -> Truncation {
    truncate_head(&TruncateHeadInput {
        content: raw_output.to_owned(),
        max_lines: Some(JS_MAX_SAFE_INTEGER),
        max_bytes: Some(default_max_bytes.unwrap_or(DEFAULT_MAX_BYTES)),
    })
}

fn max_bytes_label(default_max_bytes: Option<usize>) -> String {
    default_max_bytes.map_or_else(|| "output".to_owned(), format_size)
}

fn append_notices(output: &mut String, notices: &[String]) {
    if !notices.is_empty() {
        output.push_str("\n\n[");
        output.push_str(&notices.join(". "));
        output.push(']');
    }
}

fn formatted(
    content: String,
    details: serde_json::Map<String, serde_json::Value>,
) -> FormattedOutput {
    FormattedOutput {
        content,
        details: if details.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(details))
        },
    }
}
