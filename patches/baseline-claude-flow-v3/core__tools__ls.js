import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { createSearchIndexer } from "../../../../../../search-indexer/index.mjs";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";
const lsSchema = Type.Object({
    path: Type.Optional(Type.String({ description: "Directory to list (default: current directory)" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of entries to return (default: 500)" })),
});
const DEFAULT_LIMIT = 500;
function formatLsCall(args, theme) {
    const rawPath = str(args?.path);
    const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
    const limit = args?.limit;
    const invalidArg = invalidArgText(theme);
    let text = `${theme.fg("toolTitle", theme.bold("ls"))} ${path === null ? invalidArg : theme.fg("accent", path)}`;
    if (limit !== undefined) {
        text += theme.fg("toolOutput", ` (limit ${limit})`);
    }
    return text;
}
function formatLsResult(result, options, theme, showImages) {
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
    const entryLimit = result.details?.entryLimitReached;
    const truncation = result.details?.truncation;
    if (entryLimit || truncation?.truncated) {
        const warnings = [];
        if (entryLimit)
            warnings.push(`${entryLimit} entries limit`);
        if (truncation?.truncated)
            warnings.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
        text += `\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
    }
    return text;
}
export function createLsToolDefinition(cwd, options) {
    const searchIndexer = options?.searchIndexer ??
        createSearchIndexer(cwd, {
            operations: options?.operations,
            resolveToCwd,
            truncateHead,
            formatSize,
            defaultMaxBytes: DEFAULT_MAX_BYTES,
        });
    return {
        name: "ls",
        label: "ls",
        description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
        promptSnippet: "List directory contents",
        parameters: lsSchema,
        async execute(_toolCallId, { path, limit }, signal, _onUpdate, _ctx) {
            const result = await searchIndexer.listDirectory({
                path,
                limit: limit ?? DEFAULT_LIMIT,
            }, signal);
            return {
                content: [{ type: "text", text: result.content }],
                details: result.details,
            };
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatLsCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatLsResult(result, options, theme, context.showImages));
            return text;
        },
    };
}
export function createLsTool(cwd, options) {
    return wrapToolDefinition(createLsToolDefinition(cwd, options));
}
//# sourceMappingURL=ls.js.map
