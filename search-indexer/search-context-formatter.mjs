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
        return { lines: block, linesTruncated };
    }
    formatSingleLine({ searchPath, filePath, lineNumber, lineText, isDirectory }) {
        const relativePath = this.pathAdapter.formatMatchPath(searchPath, filePath, isDirectory);
        const sanitized = lineText
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "")
            .replace(/\n$/, "");
        const { text: truncatedText, wasTruncated } = this.truncateLine(sanitized);
        return {
            line: `${relativePath}:${lineNumber}: ${truncatedText}`,
            linesTruncated: wasTruncated,
        };
    }
}
