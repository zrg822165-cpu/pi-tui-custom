import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { createSearchIndexer } from "../../../../../../search-indexer/index.mjs";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { ensureTool } from "../../utils/tools-manager.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, GREP_MAX_LINE_LENGTH, truncateHead, truncateLine, } from "./truncate.js";
const grepSchema = Type.Object({
    pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
    path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
    glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
    ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
    literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
    context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
});
const DEFAULT_LIMIT = 100;
function formatGrepCall(args, theme) {
    const pattern = str(args?.pattern);
    const rawPath = str(args?.path);
    const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
    const glob = str(args?.glob);
    const limit = args?.limit;
    const invalidArg = invalidArgText(theme);
    let text = theme.fg("toolTitle", theme.bold("grep")) +
        " " +
        (pattern === null ? invalidArg : theme.fg("accent", `/${pattern || ""}/`)) +
        theme.fg("toolOutput", ` in ${path === null ? invalidArg : path}`);
    if (glob)
        text += theme.fg("toolOutput", ` (${glob})`);
    if (limit !== undefined)
        text += theme.fg("toolOutput", ` limit ${limit}`);
    return text;
}
function formatGrepResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    let text = "";
    if (output) {
        const lines = output.split("\n");
        const maxLines = options.expanded ? lines.length : 15;
        const displayLines = lines.slice(0, maxLines);
        const remaining = lines.length - maxLines;
        text += displayLines.map((line) => theme.fg("toolOutput", line)).join("\n");
        if (remaining > 0) {
            text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
        }
    }
    const matchLimit = result.details?.matchLimitReached;
    const truncation = result.details?.truncation;
    const linesTruncated = result.details?.linesTruncated;
    if (matchLimit || truncation?.truncated || linesTruncated) {
        const warnings = [];
        if (matchLimit)
            warnings.push(`${matchLimit} matches limit`);
        if (truncation?.truncated)
            warnings.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
        if (linesTruncated)
            warnings.push("some lines truncated");
        text += `\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
    }
    return text;
}
export function createGrepToolDefinition(cwd, options) {
    const searchIndexer = options?.searchIndexer ??
        createSearchIndexer(cwd, {
            operations: options?.operations,
            ensureTool,
            truncateHead,
            truncateLine,
            formatSize,
            defaultMaxBytes: DEFAULT_MAX_BYTES,
            grepMaxLineLength: GREP_MAX_LINE_LENGTH,
        });
    return {
        name: "grep",
        label: "grep",
        description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
        promptSnippet: "Search file contents for patterns (respects .gitignore)",
        parameters: grepSchema,
        async execute(_toolCallId, { pattern, path: searchDir, glob, ignoreCase, literal, context, limit, }, signal, _onUpdate, _ctx) {
            const result = await searchIndexer.searchText({
                pattern,
                path: searchDir,
                glob,
                ignoreCase,
                literal,
                context,
                limit: Math.max(1, limit ?? DEFAULT_LIMIT),
            }, signal);
            return {
                content: [{ type: "text", text: result.content }],
                details: result.details,
            };
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatGrepCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatGrepResult(result, options, theme, context.showImages));
            return text;
        },
    };
}
export function createGrepTool(cwd, options) {
    return wrapToolDefinition(createGrepToolDefinition(cwd, options));
}
//# sourceMappingURL=grep.js.map
