use serde::{Deserialize, Serialize};

pub const DEFAULT_MAX_LINES: usize = 2000;
pub const DEFAULT_MAX_BYTES: usize = 50 * 1024;
pub const GREP_MAX_LINE_LENGTH: usize = 500;

#[derive(Debug, Deserialize)]
#[serde(tag = "op", content = "input", rename_all = "camelCase")]
pub enum Operation {
    BuildRipgrepArgs(RipgrepArgsInput),
    BuildFdArgs(FdArgsInput),
    TruncateHead(TruncateHeadInput),
    TruncateLine(TruncateLineInput),
    FormatSize(FormatSizeInput),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OperationResult {
    Args(Vec<String>),
    Truncation(Truncation),
    TruncatedLine(TruncatedLine),
    Text(String),
}

pub fn execute(operation: Operation) -> OperationResult {
    match operation {
        Operation::BuildRipgrepArgs(input) => OperationResult::Args(build_ripgrep_args(&input)),
        Operation::BuildFdArgs(input) => OperationResult::Args(build_fd_args(&input)),
        Operation::TruncateHead(input) => OperationResult::Truncation(truncate_head(&input)),
        Operation::TruncateLine(input) => OperationResult::TruncatedLine(truncate_line(&input)),
        Operation::FormatSize(input) => OperationResult::Text(format_size(input.bytes)),
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
