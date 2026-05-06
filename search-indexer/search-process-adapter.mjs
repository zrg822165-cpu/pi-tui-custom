import { runProcessLines } from "../shell-executor/index.mjs";

export class SearchProcessAdapter {
    ensureTool;
    constructor(options = {}) {
        this.ensureTool = options.ensureTool;
    }
    async getToolPath(toolName) {
        if (!this.ensureTool) {
            throw new Error(`No tool resolver configured for ${toolName}`);
        }
        return this.ensureTool(toolName, true);
    }
    async runRipgrepJson(args, { limit, signal }) {
        const rgPath = await this.getToolPath("rg");
        if (!rgPath) {
            throw new Error("ripgrep (rg) is not available and could not be downloaded");
        }
        let matchCount = 0;
        let matchLimitReached = false;
        let killedDueToLimit = false;
        const matches = [];
        const abortController = new AbortController();
        const stopChild = (dueToLimit = false) => {
            killedDueToLimit = dueToLimit;
            abortController.abort();
        };
        const onAbort = () => {
            stopChild();
        };
        if (signal?.aborted) {
            abortController.abort();
        }
        else {
            signal?.addEventListener("abort", onAbort, { once: true });
        }
        const processResult = await runProcessLines(rgPath, args, {
            signal: abortController.signal,
            onStdoutLine: (line) => {
                if (!line.trim() || matchCount >= limit)
                    return;
                let event;
                try {
                    event = JSON.parse(line);
                }
                catch {
                    return;
                }
                if (event.type === "match") {
                    matchCount++;
                    const filePath = event.data?.path?.text;
                    const lineNumber = event.data?.line_number;
                    const lineText = event.data?.lines?.text;
                    if (filePath && typeof lineNumber === "number")
                        matches.push({ filePath, lineNumber, lineText });
                    if (matchCount >= limit) {
                        matchLimitReached = true;
                        stopChild(true);
                    }
                }
            },
        }).catch((error) => {
            signal?.removeEventListener("abort", onAbort);
            throw new Error(`Failed to run ripgrep: ${error.message}`);
        });
        signal?.removeEventListener("abort", onAbort);
        return { processResult, matches, matchCount, matchLimitReached, killedDueToLimit };
    }
    async runFd(args, signal) {
        const fdPath = await this.getToolPath("fd");
        if (!fdPath) {
            throw new Error("fd is not available and could not be downloaded");
        }
        const lines = [];
        const abortController = new AbortController();
        const relayAbort = () => abortController.abort();
        if (signal?.aborted) {
            abortController.abort();
        }
        else {
            signal?.addEventListener("abort", relayAbort, { once: true });
        }
        const processResult = await runProcessLines(fdPath, args, {
            signal: abortController.signal,
            onStdoutLine: (line) => {
                lines.push(line);
            },
        }).catch((error) => {
            signal?.removeEventListener("abort", relayAbort);
            throw new Error(`Failed to run fd: ${error.message}`);
        });
        signal?.removeEventListener("abort", relayAbort);
        return { processResult, lines };
    }
}
