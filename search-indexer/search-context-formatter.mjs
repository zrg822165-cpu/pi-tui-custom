import { runRustShadow } from "../rust-core-shadow/runner.mjs";
import { runNativeCoreBatch } from "../rust-core-shadow/native-loader.mjs";

export class SearchContextFormatter {
    fsAdapter;
    pathAdapter;
    truncateLine;
    fileCache = new Map();
    constructor(options) {
        this.fsAdapter = options.fsAdapter;
        this.pathAdapter = options.pathAdapter;
        this.truncateLine = options.truncateLine;
    }
    async getFileLines(filePath) {
        let lines = this.fileCache.get(filePath);
        if (!lines) {
            try {
                lines = await this.fsAdapter.readFileLines(filePath);
            }
            catch {
                lines = [];
            }
            this.fileCache.set(filePath, lines);
        }
        return lines;
    }
    async formatMatches({ searchPath, matches, contextValue, isDirectory }) {
        const prepared = [];
        for (const match of matches) {
            const relativePath = this.pathAdapter.formatMatchPath(searchPath, match.filePath, isDirectory);
            if (contextValue === 0 && match.lineText !== undefined) {
                prepared.push({
                    op: "formatSingleLineContext",
                    input: { relativePath, lineNumber: match.lineNumber, lineText: match.lineText },
                    fallback: () => this.formatSingleLine({ searchPath, filePath: match.filePath, lineNumber: match.lineNumber, lineText: match.lineText, isDirectory }),
                });
            }
            else {
                const fileLines = await this.getFileLines(match.filePath);
                prepared.push({
                    op: "formatBlockContext",
                    input: { relativePath, lineNumber: match.lineNumber, contextValue, fileLines },
                    fallback: () => this.formatBlock({ searchPath, filePath: match.filePath, lineNumber: match.lineNumber, contextValue, isDirectory }),
                });
            }
        }
        const batch = runNativeCoreBatch(prepared.map(({ op, input }) => ({ core: "search", op, input })));
        const values = batch.ok ? batch.values : [];
        const outputLines = [];
        let linesTruncated = false;
        for (let index = 0; index < prepared.length; index++) {
            const value = batch.ok ? values[index] : await prepared[index].fallback();
            if (value.lines) {
                outputLines.push(...value.lines);
            }
            else {
                outputLines.push(value.line);
            }
            if (value.linesTruncated) {
                linesTruncated = true;
            }
        }
        return { outputLines, linesTruncated };
    }
    async formatBlock({ searchPath, filePath, lineNumber, contextValue, isDirectory }) {
        const relativePath = this.pathAdapter.formatMatchPath(searchPath, filePath, isDirectory);
        const lines = await this.getFileLines(filePath);
        if (!lines.length)
            return { lines: [`${relativePath}:${lineNumber}: (unable to read file)`], linesTruncated: false };
        const block = [];
        let linesTruncated = false;
        const start = contextValue > 0 ? Math.max(1, lineNumber - contextValue) : lineNumber;
        const end = contextValue > 0 ? Math.min(lines.length, lineNumber + contextValue) : lineNumber;
        for (let current = start; current <= end; current++) {
            const lineText = lines[current - 1] ?? "";
            const sanitized = lineText.replace(/\r/g, "");
            const isMatchLine = current === lineNumber;
            const { text: truncatedText, wasTruncated } = this.truncateLine(sanitized);
            if (wasTruncated)
                linesTruncated = true;
            if (isMatchLine)
                block.push(`${relativePath}:${current}: ${truncatedText}`);
            else
                block.push(`${relativePath}-${current}- ${truncatedText}`);
        }
        const result = { lines: block, linesTruncated };
        runRustShadow({
            name: "search.formatBlockContext",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "formatBlockContext",
            input: { relativePath, lineNumber, contextValue, fileLines: lines },
            jsValue: result,
        });
        return result;
    }
    formatSingleLine({ searchPath, filePath, lineNumber, lineText, isDirectory }) {
        const relativePath = this.pathAdapter.formatMatchPath(searchPath, filePath, isDirectory);
        const sanitized = lineText
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "")
            .replace(/\n$/, "");
        const { text: truncatedText, wasTruncated } = this.truncateLine(sanitized);
        const result = {
            line: `${relativePath}:${lineNumber}: ${truncatedText}`,
            linesTruncated: wasTruncated,
        };
        runRustShadow({
            name: "search.formatSingleLineContext",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "formatSingleLineContext",
            input: { relativePath, lineNumber, lineText },
            jsValue: result,
        });
        return result;
    }
}
