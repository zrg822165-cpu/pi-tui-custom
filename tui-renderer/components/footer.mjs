import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { theme } from "../../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text) {
    // Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
    return text
        .replace(/[\r\n\t]/g, " ")
        .replace(/ +/g, " ")
        .trim();
}
/**
 * Format token counts (similar to web-ui)
 */
function formatTokens(count) {
    if (count < 1000)
        return count.toString();
    if (count < 10000)
        return `${(count / 1000).toFixed(1)}k`;
    if (count < 1000000)
        return `${Math.round(count / 1000)}k`;
    if (count < 10000000)
        return `${(count / 1000000).toFixed(1)}M`;
    return `${Math.round(count / 1000000)}M`;
}
function renderContextBar(percent, width = 10) {
    if (!Number.isFinite(percent)) {
        return theme.fg("dim", "░".repeat(width));
    }
    const safePercent = Math.max(0, Math.min(100, percent));
    const filled = Math.round((safePercent / 100) * width);
    const empty = width - filled;
    const color = safePercent > 90 ? "error" : safePercent > 70 ? "warning" : "success";
    return theme.fg(color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
}
function joinUsageParts(parts) {
    return parts.length > 0 ? parts.join(" ") : "空闲";
}
/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent {
    session;
    footerData;
    autoCompactEnabled = true;
    __piRenderCacheSafe = true;
    cachedUsageSignature = "";
    cachedUsageTotals = {
        totalInput: 0,
        totalOutput: 0,
        totalCacheRead: 0,
        totalCacheWrite: 0,
        totalCost: 0,
    };
    cachedRenderKey = "";
    cachedRenderLines = undefined;
    constructor(session, footerData) {
        this.session = session;
        this.footerData = footerData;
    }
    setSession(session) {
        if (this.session === session)
            return;
        this.session = session;
        this.invalidate();
    }
    setAutoCompactEnabled(enabled) {
        if (this.autoCompactEnabled === enabled)
            return;
        this.autoCompactEnabled = enabled;
        this.invalidate();
    }
    /**
     * No-op: git branch caching now handled by provider.
     * Kept for compatibility with existing call sites in interactive-mode.
     */
    invalidate() {
        this.cachedUsageSignature = "";
        this.cachedRenderKey = "";
        this.cachedRenderLines = undefined;
        this.parentContainer?.markDirty?.();
    }
    /**
     * Clean up resources.
     * Git watcher cleanup now handled by provider.
     */
    dispose() {
        // Git watcher cleanup handled by provider
    }
    getSessionEntriesForUsage() {
        const manager = this.session.sessionManager;
        return Array.isArray(manager.fileEntries) ? manager.fileEntries : manager.getEntries();
    }
    buildUsageSignature(entries) {
        const manager = this.session.sessionManager;
        const last = entries[entries.length - 1];
        const lastUsage = last?.type === "message" && last.message?.role === "assistant"
            ? last.message.usage
            : undefined;
        return [
            manager.getSessionId?.() ?? "",
            entries.length,
            last?.id ?? "",
            last?.timestamp ?? "",
            lastUsage?.input ?? 0,
            lastUsage?.output ?? 0,
            lastUsage?.cacheRead ?? 0,
            lastUsage?.cacheWrite ?? 0,
            lastUsage?.cost?.total ?? 0,
        ].join("|");
    }
    getUsageTotals() {
        const entries = this.getSessionEntriesForUsage();
        const signature = this.buildUsageSignature(entries);
        if (signature === this.cachedUsageSignature) {
            return this.cachedUsageTotals;
        }
        // Calculate cumulative usage from ALL session entries (not just post-compaction messages)
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCacheWrite = 0;
        let totalCost = 0;
        for (const entry of entries) {
            if (entry.type === "message" && entry.message.role === "assistant") {
                totalInput += entry.message.usage.input;
                totalOutput += entry.message.usage.output;
                totalCacheRead += entry.message.usage.cacheRead;
                totalCacheWrite += entry.message.usage.cacheWrite;
                totalCost += entry.message.usage.cost.total;
            }
        }
        this.cachedUsageSignature = signature;
        this.cachedUsageTotals = { totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalCost };
        return this.cachedUsageTotals;
    }
    getExtensionStatusSignature(extensionStatuses) {
        if (extensionStatuses.size === 0)
            return "";
        return Array.from(extensionStatuses.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, text]) => `${key}:${sanitizeStatusText(text)}`)
            .join("\u001f");
    }
    render(width) {
        const state = this.session.state;
        const { totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalCost } = this.getUsageTotals();
        // Calculate context usage from session (handles compaction correctly).
        // After compaction, tokens are unknown until the next LLM response.
        const contextUsage = this.session.getContextUsage();
        const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
        const contextPercentValue = contextUsage?.percent ?? 0;
        const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
        // Replace home directory with ~
        let pwd = this.session.sessionManager.getCwd();
        const home = process.env.HOME || process.env.USERPROFILE;
        if (home && pwd.startsWith(home)) {
            pwd = `~${pwd.slice(home.length)}`;
        }
        // Add git branch if available
        const branch = this.footerData.getGitBranch();
        if (branch) {
            pwd = `${pwd} git:(${branch})`;
        }
        // Add session name if set
        const sessionName = this.session.sessionManager.getSessionName();
        if (sessionName) {
            pwd = `${pwd} │ ${sessionName}`;
        }
        const extensionStatuses = this.footerData.getExtensionStatuses();
        const extensionStatusSignature = this.getExtensionStatusSignature(extensionStatuses);
        const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
        const renderKey = [
            width,
            this.cachedUsageSignature,
            state.model?.provider ?? "",
            state.model?.id ?? "",
            state.model?.contextWindow ?? "",
            state.model?.reasoning ? "reasoning" : "no-reasoning",
            state.thinkingLevel ?? "",
            contextWindow,
            contextUsage?.percent === null ? "?" : contextPercentValue,
            this.autoCompactEnabled ? "auto" : "manual",
            usingSubscription ? "sub" : "api",
            pwd,
            this.footerData.getAvailableProviderCount(),
            extensionStatusSignature,
        ].join("|");
        if (renderKey === this.cachedRenderKey && this.cachedRenderLines) {
            return this.cachedRenderLines;
        }
        // Build stats line
        const statsParts = [];
        if (totalInput)
            statsParts.push(`输入 ${formatTokens(totalInput)}`);
        if (totalOutput)
            statsParts.push(`输出 ${formatTokens(totalOutput)}`);
        if (totalCacheRead || totalCacheWrite)
            statsParts.push(`缓存 ${formatTokens(totalCacheRead + totalCacheWrite)}`);
        // Show cost with "(sub)" indicator if using OAuth subscription
        if (totalCost || usingSubscription) {
            const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
            statsParts.push(costStr);
        }
        // Add model name on the left, plus thinking level if model supports it
        const modelName = state.model?.id || "no-model";
        let modelBadge = modelName;
        if (state.model?.reasoning) {
            const thinkingLevel = state.thinkingLevel || "off";
            modelBadge = thinkingLevel === "off" ? modelName : `${modelName} ${thinkingLevel}`;
        }
        if (this.footerData.getAvailableProviderCount() > 1 && state.model && !modelName.includes("/")) {
            modelBadge = `${state.model.provider}/${modelBadge}`;
        }
        const contextBar = renderContextBar(contextPercentValue);
        const compactFooter = width < 72;
        const contextName = compactFooter ? "上下文" : "上下文";
        const autoLabel = this.autoCompactEnabled ? " 自动" : "";
        const contextLabel = contextPercent === "?"
            ? `${contextName} ${contextBar} ?/${formatTokens(contextWindow)}${autoLabel}`
            : `${contextName} ${contextBar} ${contextPercent}%/${formatTokens(contextWindow)}${autoLabel}`;
        const usageLabel = joinUsageParts(statsParts);
        const modelLine = `${theme.fg("accent", `[${modelBadge}]`)} ${theme.fg("dim", "│")} ${theme.fg("muted", pwd)}`;
        const statsLine = compactFooter
            ? `${contextLabel} ${theme.fg("dim", "│")} ${theme.fg("dim", usageLabel)}`
            : `${theme.fg("dim", "HUD")} ${contextLabel} ${theme.fg("dim", "│")} ${theme.fg("dim", usageLabel)}`;
        const lines = [
            truncateToWidth(modelLine, width, theme.fg("dim", "...")),
            truncateToWidth(statsLine, width, theme.fg("dim", "...")),
        ];
        // Add extension statuses on a single line, sorted by key alphabetically
        if (extensionStatuses.size > 0) {
            const sortedStatuses = Array.from(extensionStatuses.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, text]) => sanitizeStatusText(text));
            const statusLine = sortedStatuses.join(" ");
            // Truncate to terminal width with dim ellipsis for consistency with footer style
            lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
        }
        this.cachedRenderKey = renderKey;
        this.cachedRenderLines = lines;
        return lines;
    }
}
//# sourceMappingURL=footer.js.map
