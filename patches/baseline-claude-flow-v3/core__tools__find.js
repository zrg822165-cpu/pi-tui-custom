import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { createSearchIndexer } from "../../../../../../search-indexer/index.mjs";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { ensureTool } from "../../utils/tools-manager.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";
const findSchema = Type.Object({
    pattern: Type.String({
        description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'",
    }),
    path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 1000)" })),
});
const DEFAULT_LIMIT = 1000;
function formatFindCall(args, theme) {
    const pattern = str(args?.pattern);
    const rawPath = str(args?.path);
    const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
    const limit = args?.limit;
    const invalidArg = invalidArgText(theme);
    let text = theme.fg("toolTitle", theme.bold("find")) +
        " " +
        (pattern === null ? invalidArg : theme.fg("accent", pattern || "")) +
        theme.fg("toolOutput", ` in ${path === null ? invalidArg : path}`);
    if (limit !== undefined) {
        text += theme.fg("toolOutput", ` (limit ${limit})`);
    }
    return text;
}
function formatFindResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    let text = "";
    if (output) {
        const lines = output.split("\n");
        const maxLines = options.expanded ? lines.length : 20;
        const displayLines = lines.slice(0, maxLines);
        const remaining = lines.length - maxLines;
        text += displayLines.map((line) => theme.fg("toolOutput", line)).join("\n");
        if (remaining > 0) {
            text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
        }
    }
    const resultLimit = result.details?.resultLimitReached;
    const truncation = result.details?.truncation;
    if (resultLimit || truncation?.truncated) {
        const warnings = [];
        if (resultLimit)
            warnings.push(`${resultLimit} results limit`);
        if (truncation?.truncated)
            warnings.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
        text += `\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
    }
    return text;
}
export function createFindToolDefinition(cwd, options) {
    const searchIndexer = options?.searchIndexer ??
        createSearchIndexer(cwd, {
            operations: options?.operations,
            ensureTool,
            resolveToCwd,
            truncateHead,
            formatSize,
            defaultMaxBytes: DEFAULT_MAX_BYTES,
        });
    return {
        name: "find",
        label: "find",
        description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
        promptSnippet: "Find files by glob pattern (respects .gitignore)",
        parameters: findSchema,
        async execute(_toolCallId, { pattern, path: searchDir, limit }, signal, _onUpdate, _ctx) {
            const result = await searchIndexer.findFiles({
                pattern,
                path: searchDir,
                limit: limit ?? DEFAULT_LIMIT,
            }, signal);
            return {
                content: [{ type: "text", text: result.content }],
                details: result.details,
            };
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatFindCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatFindResult(result, options, theme, context.showImages));
            return text;
        },
    };
}
export function createFindTool(cwd, options) {
    return wrapToolDefinition(createFindToolDefinition(cwd, options));
}
//# sourceMappingURL=find.js.map
