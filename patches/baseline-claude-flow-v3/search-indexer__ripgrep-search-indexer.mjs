import { SearchContextFormatter } from "./search-context-formatter.mjs";
import { SearchFsAdapter } from "./search-fs-adapter.mjs";
import { SearchPathAdapter } from "./search-path-adapter.mjs";
import { SearchProcessAdapter } from "./search-process-adapter.mjs";
import { SearchQueryBuilder } from "./search-query-builder.mjs";
import { SearchResultFormatter } from "./search-result-formatter.mjs";

export class RipgrepSearchIndexer {
    cwd;
    fsAdapter;
    pathAdapter;
    processAdapter;
    queryBuilder;
    resultFormatter;
    contextFormatter;
    constructor(cwd, options = {}) {
        this.cwd = cwd;
        this.fsAdapter = options.fsAdapter ?? new SearchFsAdapter({ operations: options.operations });
        this.pathAdapter = options.pathAdapter ?? new SearchPathAdapter(cwd, { resolveToCwd: options.resolveToCwd });
        this.processAdapter = options.processAdapter ?? new SearchProcessAdapter({ ensureTool: options.ensureTool });
        this.queryBuilder = options.queryBuilder ?? new SearchQueryBuilder();
        this.resultFormatter = options.resultFormatter ??
            new SearchResultFormatter({
                truncateHead: options.truncateHead,
                formatSize: options.formatSize,
                defaultMaxBytes: options.defaultMaxBytes,
                grepMaxLineLength: options.grepMaxLineLength,
            });
        this.contextFormatter = options.contextFormatter ??
            new SearchContextFormatter({
                fsAdapter: this.fsAdapter,
                pathAdapter: this.pathAdapter,
                truncateLine: options.truncateLine,
            });
    }
    warmup() {
        return undefined;
    }
    invalidate() {
        return undefined;
    }
    resolvePath(value) {
        return this.pathAdapter.resolvePath(value);
    }
    async searchText({ pattern, path: searchDir, glob, ignoreCase, literal, context = 0, limit = 100, }, signal) {
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        const searchPath = this.resolvePath(searchDir || ".");
        const isDirectory = await this.fsAdapter.isDirectory(searchPath);
        const contextValue = context && context > 0 ? context : 0;
        const effectiveLimit = Math.max(1, limit);
        const args = this.queryBuilder.buildRipgrepArgs({ pattern, searchPath, glob, ignoreCase, literal });
        const { processResult, matches, matchCount, matchLimitReached, killedDueToLimit } = await this.processAdapter.runRipgrepJson(args, { limit: effectiveLimit, signal });
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        if (!killedDueToLimit && processResult.exitCode !== 0 && processResult.exitCode !== 1) {
            const errorMsg = processResult.stderr.trim() || `ripgrep exited with code ${processResult.exitCode}`;
            throw new Error(errorMsg);
        }
        if (matchCount === 0) {
            return { content: "No matches found", details: undefined };
        }
        const { outputLines, linesTruncated } = await this.contextFormatter.formatMatches({ searchPath, matches, contextValue, isDirectory });
        return this.resultFormatter.formatTextSearch(outputLines, { effectiveLimit, matchLimitReached, linesTruncated });
    }
    async findFiles({ pattern, path: searchDir, limit = 1000 }, signal) {
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        const searchPath = this.resolvePath(searchDir || ".");
        const effectiveLimit = limit;
        if (this.fsAdapter.hasGlob()) {
            if (!(await this.fsAdapter.exists(searchPath))) {
                throw new Error(`Path not found: ${searchPath}`);
            }
            const results = await this.fsAdapter.glob(pattern, searchPath, {
                ignore: ["**/node_modules/**", "**/.git/**"],
                limit: effectiveLimit,
            });
            if (signal?.aborted) {
                throw new Error("Operation aborted");
            }
            return this.resultFormatter.formatFindResults(results.map((p) => {
                return this.pathAdapter.relativizeGlobPath(searchPath, p);
            }), effectiveLimit, false);
        }
        const args = this.queryBuilder.buildFdArgs({ pattern, searchPath, limit: effectiveLimit });
        const { processResult, lines } = await this.processAdapter.runFd(args, signal);
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        const output = lines.join("\n");
        if (processResult.exitCode !== 0) {
            const errorMsg = processResult.stderr.trim() || `fd exited with code ${processResult.exitCode}`;
            if (!output) {
                throw new Error(errorMsg);
            }
        }
        const relativized = [];
        for (const rawLine of lines) {
            const relativePath = this.pathAdapter.relativizeFoundPath(searchPath, rawLine);
            if (relativePath)
                relativized.push(relativePath);
        }
        return this.resultFormatter.formatFindResults(relativized, effectiveLimit, true);
    }
    async listDirectory({ path: dir, limit = 500 }, signal) {
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        const dirPath = this.resolvePath(dir || ".");
        if (!(await this.fsAdapter.exists(dirPath))) {
            throw new Error(`Path not found: ${dirPath}`);
        }
        const stat = await this.fsAdapter.stat(dirPath);
        if (!stat.isDirectory()) {
            throw new Error(`Not a directory: ${dirPath}`);
        }
        let entries;
        try {
            entries = await this.fsAdapter.readdir(dirPath);
        }
        catch (e) {
            throw new Error(`Cannot read directory: ${e.message}`);
        }
        entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        const results = [];
        let entryLimitReached = false;
        for (const entry of entries) {
            if (results.length >= limit) {
                entryLimitReached = true;
                break;
            }
            const fullPath = this.pathAdapter.join(dirPath, entry);
            let suffix = "";
            try {
                const entryStat = await this.fsAdapter.stat(fullPath);
                if (entryStat.isDirectory())
                    suffix = "/";
            }
            catch {
                continue;
            }
            results.push(entry + suffix);
        }
        return this.resultFormatter.formatDirectoryResults(results, limit, entryLimitReached);
    }
    readMatchContext() {
        return undefined;
    }
}
