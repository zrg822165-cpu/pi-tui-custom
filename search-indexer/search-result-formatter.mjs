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
        return { content: output, details: Object.keys(details).length > 0 ? details : undefined };
    }
    formatFindResults(relativized, effectiveLimit, includeRefineNotice) {
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
        return { content: output, details: Object.keys(details).length > 0 ? details : undefined };
    }
    formatDirectoryResults(results, limit, entryLimitReached) {
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
        return { content: output, details: Object.keys(details).length > 0 ? details : undefined };
    }
}
