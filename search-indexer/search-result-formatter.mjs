import { runRustCoreValue, runRustShadow } from "../rust-core-shadow/runner.mjs";

function runSearchCore(op, input) {
    return runRustCoreValue({ commandEnv: "PI_SEARCH_CORE_COMMAND", op, input });
}

export class SearchResultFormatter {
    truncateHead;
    formatSize;
    defaultMaxBytes;
    grepMaxLineLength;
    constructor(options = {}) {
        this.truncateHead = options.truncateHead;
        this.formatSize = options.formatSize;
        this.defaultMaxBytes = options.defaultMaxBytes;
        this.grepMaxLineLength = options.grepMaxLineLength;
    }
    maxBytesLabel() {
        if (this.defaultMaxBytes === undefined) {
            return "output";
        }
        if (this.formatSize) {
            return this.formatSize(this.defaultMaxBytes);
        }
        if (this.defaultMaxBytes >= 1024 && this.defaultMaxBytes % 1024 === 0) {
            return `${this.defaultMaxBytes / 1024}KB`;
        }
        return `${this.defaultMaxBytes}B`;
    }
    truncateOutput(rawOutput) {
        return this.truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
    }
    formatTextSearch(outputLines, { effectiveLimit, matchLimitReached, linesTruncated }) {
        const input = { outputLines, effectiveLimit, matchLimitReached, linesTruncated, defaultMaxBytes: this.defaultMaxBytes, grepMaxLineLength: this.grepMaxLineLength };
        const rust = runSearchCore("formatTextSearch", input);
        if (rust.ok) {
            return rust.value;
        }
        const rawOutput = outputLines.join("\n");
        const truncation = this.truncateOutput(rawOutput);
        let output = truncation.content;
        const details = {};
        const notices = [];
        if (matchLimitReached) {
            notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
            details.matchLimitReached = effectiveLimit;
        }
        if (truncation.truncated) {
            notices.push(`${this.maxBytesLabel()} limit reached`);
            details.truncation = truncation;
        }
        if (linesTruncated) {
            notices.push(`Some lines truncated to ${this.grepMaxLineLength} chars. Use read tool to see full lines`);
            details.linesTruncated = true;
        }
        if (notices.length > 0)
            output += `\n\n[${notices.join(". ")}]`;
        const result = { content: output, details: Object.keys(details).length > 0 ? details : undefined };
        runRustShadow({
            name: "search.formatTextSearch",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "formatTextSearch",
            input,
            jsValue: result,
        });
        return result;
    }
    formatFindResults(relativized, effectiveLimit, includeRefineNotice) {
        const input = { relativized, effectiveLimit, includeRefineNotice, defaultMaxBytes: this.defaultMaxBytes };
        const rust = runSearchCore("formatFindResults", input);
        if (rust.ok) {
            return rust.value;
        }
        if (relativized.length === 0) {
            return { content: "No files found matching pattern", details: undefined };
        }
        const resultLimitReached = relativized.length >= effectiveLimit;
        const rawOutput = relativized.join("\n");
        const truncation = this.truncateOutput(rawOutput);
        let output = truncation.content;
        const details = {};
        const notices = [];
        if (resultLimitReached) {
            const suffix = includeRefineNotice ? `. Use limit=${effectiveLimit * 2} for more, or refine pattern` : "";
            notices.push(`${effectiveLimit} results limit reached${suffix}`);
            details.resultLimitReached = effectiveLimit;
        }
        if (truncation.truncated) {
            notices.push(`${this.maxBytesLabel()} limit reached`);
            details.truncation = truncation;
        }
        if (notices.length > 0) {
            output += `\n\n[${notices.join(". ")}]`;
        }
        const result = { content: output, details: Object.keys(details).length > 0 ? details : undefined };
        runRustShadow({
            name: "search.formatFindResults",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "formatFindResults",
            input,
            jsValue: result,
        });
        return result;
    }
    formatDirectoryResults(results, limit, entryLimitReached) {
        const input = { results, limit, entryLimitReached, defaultMaxBytes: this.defaultMaxBytes };
        const rust = runSearchCore("formatDirectoryResults", input);
        if (rust.ok) {
            return rust.value;
        }
        if (results.length === 0) {
            return { content: "(empty directory)", details: undefined };
        }
        const rawOutput = results.join("\n");
        const truncation = this.truncateOutput(rawOutput);
        let output = truncation.content;
        const details = {};
        const notices = [];
        if (entryLimitReached) {
            notices.push(`${limit} entries limit reached. Use limit=${limit * 2} for more`);
            details.entryLimitReached = limit;
        }
        if (truncation.truncated) {
            notices.push(`${this.maxBytesLabel()} limit reached`);
            details.truncation = truncation;
        }
        if (notices.length > 0) {
            output += `\n\n[${notices.join(". ")}]`;
        }
        const result = { content: output, details: Object.keys(details).length > 0 ? details : undefined };
        runRustShadow({
            name: "search.formatDirectoryResults",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "formatDirectoryResults",
            input,
            jsValue: result,
        });
        return result;
    }
}
