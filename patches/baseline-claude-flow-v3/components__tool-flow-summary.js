import { Container, Text } from "@mariozechner/pi-tui";
import { theme } from "../theme/theme.js";
import { keyText } from "./keybinding-hints.js";
const FLOW_TOOLS = new Set(["bash", "edit", "find", "grep", "ls", "read", "write"]);
const TOOL_ORDER = ["grep", "read", "ls", "edit", "write", "bash", "tool"];
function plural(count, singular, pluralForm = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}
function capitalize(text) {
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}
function expandHint() {
    return `(${keyText("app.tools.expand") || "ctrl+o"} to expand)`;
}
function getToolTarget(component) {
    const args = component.args;
    if (!args || typeof args !== "object") {
        return "";
    }
    if (component.toolName === "grep" || component.toolName === "find") {
        const pattern = args.pattern ?? args.query;
        const path = args.path ?? args.cwd;
        if (pattern && path) {
            return `${String(pattern)} in ${String(path)}`;
        }
        return pattern ? String(pattern) : path ? String(path) : "";
    }
    const path = args.filePath ?? args.file_path ?? args.path ?? args.cwd;
    const command = args.command ?? args.cmd;
    return command ? String(command) : path ? String(path) : "";
}
function normalizeToolName(toolName) {
    return toolName === "find" ? "grep" : FLOW_TOOLS.has(toolName) ? toolName : "tool";
}
function getNounForToolName(toolName) {
    if (toolName === "read")
        return "file";
    if (toolName === "grep" || toolName === "find")
        return "pattern";
    if (toolName === "ls")
        return "directory";
    if (toolName === "edit" || toolName === "write")
        return "file";
    if (toolName === "bash")
        return "command";
    return "tool";
}
function getRunningVerb(toolName) {
    if (toolName === "read")
        return "Reading";
    if (toolName === "grep" || toolName === "find")
        return "Searching";
    if (toolName === "ls")
        return "Listing";
    if (toolName === "edit")
        return "Editing";
    if (toolName === "write")
        return "Writing";
    if (toolName === "bash")
        return "Running";
    return "Using";
}
function getRunningPhrase(toolName, count) {
    if (toolName === "grep" || toolName === "find") {
        return `searching for ${plural(count, "pattern")}`;
    }
    return `${getRunningVerb(toolName).toLowerCase()} ${plural(count, getNounForToolName(toolName), toolName === "ls" ? "directories" : undefined)}`;
}
function getPastPhrase(toolName, count) {
    if (toolName === "read")
        return `read ${plural(count, "file")}`;
    if (toolName === "grep" || toolName === "find")
        return `searched for ${plural(count, "pattern")}`;
    if (toolName === "ls")
        return `listed ${plural(count, "directory", "directories")}`;
    if (toolName === "edit")
        return `edited ${plural(count, "file")}`;
    if (toolName === "write")
        return `wrote ${plural(count, "file")}`;
    if (toolName === "bash")
        return `ran ${plural(count, "command")}`;
    return `used ${plural(count, "tool")}`;
}
function sortSummaryNames(names) {
    return names.sort((a, b) => {
        const ai = TOOL_ORDER.indexOf(a);
        const bi = TOOL_ORDER.indexOf(b);
        return (ai === -1 ? TOOL_ORDER.length : ai) - (bi === -1 ? TOOL_ORDER.length : bi);
    });
}
function formatSubline(target) {
    return target ? `\n  ${theme.fg("dim", `⎿  ${target}`)}` : "";
}
export class ToolFlowSummaryComponent extends Container {
    tools = [];
    expanded = false;
    collapsedText = new Text("", 0, 0);
    detailContainer = new Container();
    lastCollapsedText = "";
    lastCollapsedSignature = "";
    showingExpanded = false;
    constructor() {
        super();
        this.addChild(this.collapsedText);
        this.updateDisplay();
    }
    canAccept(toolName) {
        if (this.tools.length === 0) {
            return true;
        }
        return FLOW_TOOLS.has(toolName) && this.tools.every((component) => FLOW_TOOLS.has(component.toolName));
    }
    addTool(component) {
        this.tools.push(component);
        component.setExpanded(this.expanded);
        this.detailContainer.addChild(component);
        this.updateDisplay();
    }
    setExpanded(expanded) {
        this.expanded = expanded;
        for (const component of this.tools) {
            component.setExpanded(expanded);
        }
        this.updateDisplay();
    }
    invalidate() {
        super.invalidate();
        this.updateDisplay();
    }
    updateDisplay() {
        if (this.expanded) {
            if (!this.showingExpanded) {
                this.clear();
                this.addChild(this.detailContainer);
                this.showingExpanded = true;
            }
            return;
        }
        if (this.showingExpanded || this.children[0] !== this.collapsedText || this.children.length !== 1) {
            this.clear();
            this.addChild(this.collapsedText);
            this.showingExpanded = false;
        }
        const signature = this.getCollapsedSignature();
        if (signature === this.lastCollapsedSignature) {
            return;
        }
        this.lastCollapsedSignature = signature;
        const text = this.formatCollapsed();
        if (text !== this.lastCollapsedText) {
            this.lastCollapsedText = text;
            this.collapsedText.setText(text);
        }
    }
    getCollapsedSignature() {
        return this.tools.map((component) => {
            const resultState = component.result ? (component.result.isError ? "error" : "done") : "pending";
            return [
                component.toolCallId,
                component.toolName,
                component.isPartial ? "partial" : "complete",
                resultState,
                getToolTarget(component),
            ].join(":");
        }).join("|");
    }
    formatCollapsed() {
        if (this.tools.length === 0) {
            return "";
        }
        const hint = expandHint();
        const hasError = this.tools.some((component) => component.result?.isError);
        const isRunning = this.tools.some((component) => !component.result || component.isPartial);
        if (hasError) {
            const failed = this.tools.filter((component) => component.result?.isError).length;
            const target = this.getRepresentativeTarget();
            return `  ${theme.fg("error", `Failed ${plural(failed, "tool")}`)} ${theme.fg("muted", hint)}${formatSubline(target)}`;
        }
        if (isRunning) {
            if (this.tools.length === 1) {
                const component = this.tools[0];
                const phrase = component.toolName === "grep" || component.toolName === "find"
                    ? `Searching for ${plural(1, "pattern")}…`
                    : `${getRunningVerb(component.toolName)} ${plural(1, getNounForToolName(component.toolName), component.toolName === "ls" ? "directories" : undefined)}…`;
                const target = getToolTarget(component);
                return `  ${theme.fg("muted", `${phrase} ${hint}`)}${formatSubline(target)}`;
            }
            const latestTarget = this.getRepresentativeTarget();
            return `  ${theme.fg("muted", `${this.formatAggregate(true)}… ${hint}`)}${formatSubline(latestTarget)}`;
        }
        if (this.tools.length === 1) {
            const component = this.tools[0];
            const line = capitalize(getPastPhrase(component.toolName, 1));
            const target = getToolTarget(component);
            return `  ${theme.fg("muted", `${line} ${hint}`)}${formatSubline(target)}`;
        }
        return `  ${theme.fg("muted", `${this.formatAggregate(false)} ${hint}`)}${formatSubline(this.getRepresentativeTarget())}`;
    }
    getRepresentativeTarget() {
        return [...this.tools].reverse().map(getToolTarget).find(Boolean) ?? "";
    }
    formatAggregate(running) {
        const counts = new Map();
        for (const component of this.tools) {
            const name = normalizeToolName(component.toolName);
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const phrases = sortSummaryNames([...counts.keys()]).map((name) => {
            if (running) {
                return getRunningPhrase(name, counts.get(name) ?? 0);
            }
            return getPastPhrase(name, counts.get(name) ?? 0);
        });
        return capitalize(phrases.join(", "));
    }
}
//# sourceMappingURL=tool-flow-summary.js.map
