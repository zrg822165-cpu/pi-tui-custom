import { Container, getCapabilities, Image, Text } from "@mariozechner/pi-tui";
import { createAllToolDefinitions } from "../../../core/tools/index.js";
import { getTextOutput as getRenderedTextOutput } from "../../../core/tools/render-utils.js";
import { convertToPng } from "../../../utils/image-convert.js";
import { theme } from "../theme/theme.js";
const COMPACT_RESULT_TOOLS = new Set(["bash", "edit", "find", "grep", "ls", "read", "write"]);
function summarizeToolArgs(toolName, args) {
    if (!args || typeof args !== "object")
        return "";
    const path = args.filePath ?? args.file_path ?? args.path ?? args.cwd;
    const command = args.command ?? args.cmd;
    const pattern = args.pattern ?? args.query;
    if (command)
        return String(command);
    if ((toolName === "grep" || toolName === "find") && pattern) {
        return path ? `${String(pattern)} in ${String(path)}` : String(pattern);
    }
    if (path)
        return String(path);
    if (pattern)
        return String(pattern);
    const keys = Object.keys(args).slice(0, 2);
    if (keys.length === 0)
        return "";
    return keys.map((key) => `${key}: ${String(args[key]).slice(0, 40)}`).join(", ");
}
export function getToolDisplayTarget(toolName, args) {
    return summarizeToolArgs(toolName, args);
}
export class ToolExecutionComponent extends Container {
    contentBox;
    contentText;
    selfRenderContainer;
    callRendererComponent;
    resultRendererComponent;
    rendererState = {};
    imageComponents = [];
    imageSpacers = [];
    toolName;
    toolCallId;
    args;
    lastArgsSummary = "";
    expanded = false;
    showImages;
    imageWidthCells;
    isPartial = true;
    toolDefinition;
    builtInToolDefinition;
    ui;
    cwd;
    executionStarted = false;
    argsComplete = false;
    result;
    convertedImages = new Map();
    hideComponent = false;
    displayVersion = 0;
    lastDisplaySignature = "";
    constructor(toolName, toolCallId, args, options = {}, toolDefinition, ui, cwd) {
        super();
        this.toolName = toolName;
        this.toolCallId = toolCallId;
        this.args = args;
        this.toolDefinition = toolDefinition;
        this.builtInToolDefinition = createAllToolDefinitions(cwd)[toolName];
        this.showImages = options.showImages ?? true;
        this.imageWidthCells = options.imageWidthCells ?? 60;
        this.ui = ui;
        this.cwd = cwd;
        // Always create all shell variants. contentBox is used for default renderer-based composition.
        // selfRenderContainer is used when the tool renders its own framing.
        // contentText is reserved for generic fallback rendering when no tool definition exists.
        this.contentBox = new Container();
        this.contentText = new Text("", 1, 0);
        this.selfRenderContainer = new Container();
        if (this.hasRendererDefinition()) {
            this.addChild(this.getRenderShell() === "self" ? this.selfRenderContainer : this.contentBox);
        }
        else {
            this.addChild(this.contentText);
        }
        this.updateDisplay();
    }
    getCallRenderer() {
        if (!this.builtInToolDefinition) {
            return this.toolDefinition?.renderCall;
        }
        if (!this.toolDefinition) {
            return this.builtInToolDefinition.renderCall;
        }
        return this.toolDefinition.renderCall ?? this.builtInToolDefinition.renderCall;
    }
    getResultRenderer() {
        if (!this.builtInToolDefinition) {
            return this.toolDefinition?.renderResult;
        }
        if (!this.toolDefinition) {
            return this.builtInToolDefinition.renderResult;
        }
        return this.toolDefinition.renderResult ?? this.builtInToolDefinition.renderResult;
    }
    hasRendererDefinition() {
        return this.builtInToolDefinition !== undefined || this.toolDefinition !== undefined;
    }
    getRenderShell() {
        if (!this.builtInToolDefinition) {
            return this.toolDefinition?.renderShell ?? "default";
        }
        if (!this.toolDefinition) {
            return this.builtInToolDefinition.renderShell ?? "default";
        }
        return this.toolDefinition.renderShell ?? this.builtInToolDefinition.renderShell ?? "default";
    }
    getRenderContext(lastComponent) {
        return {
            args: this.args,
            toolCallId: this.toolCallId,
            invalidate: () => {
                this.invalidate();
                this.ui.requestRender();
            },
            lastComponent,
            state: this.rendererState,
            cwd: this.cwd,
            executionStarted: this.executionStarted,
            argsComplete: this.argsComplete,
            isPartial: this.isPartial,
            expanded: this.expanded,
            showImages: this.showImages,
            isError: this.result?.isError ?? false,
        };
    }
    createCallFallback() {
        return new Text(this.formatToolTitle(), 0, 0);
    }
    createResultFallback() {
        const output = this.getTextOutput();
        if (!output) {
            return undefined;
        }
        return new Text(theme.fg("toolOutput", output), 0, 0);
    }
    usesCompactResultFlow() {
        return this.result !== undefined &&
            !this.expanded &&
            !this.result.isError &&
            COMPACT_RESULT_TOOLS.has(this.toolName);
    }
    getOutputLines() {
        const output = this.getTextOutput().trim();
        if (!output) {
            return [];
        }
        return output.split("\n").filter((line) => line.trim() !== "");
    }
    createCompactResultSummary() {
        const lines = this.getOutputLines();
        const output = lines.join("\n");
        const truncated = this.result?.details?.truncation?.truncated ||
            this.result?.details?.entryLimitReached ||
            this.result?.details?.matchLimitReached ||
            this.result?.details?.resultLimitReached;
        const suffix = truncated ? "，已截断" : "";
        if (this.toolName === "read") {
            const hasImage = this.result?.content.some((c) => c.type === "image") ?? false;
            if (hasImage) {
                return `已读取图片${suffix}`;
            }
            return lines.length > 0 ? `已读取 ${lines.length} 行${suffix}` : `已读取${suffix}`;
        }
        if (this.toolName === "ls") {
            if (output === "(empty directory)") {
                return "目录为空";
            }
            return lines.length > 0 ? `列出 ${lines.length} 项${suffix}` : `列出完成${suffix}`;
        }
        if (this.toolName === "grep") {
            if (output === "No matches found") {
                return "未找到匹配";
            }
            return lines.length > 0 ? `找到 ${lines.length} 处匹配${suffix}` : `搜索完成${suffix}`;
        }
        if (this.toolName === "find") {
            if (output === "No files found matching pattern") {
                return "未找到文件";
            }
            return lines.length > 0 ? `找到 ${lines.length} 个文件${suffix}` : `查找完成${suffix}`;
        }
        if (this.toolName === "write") {
            const bytes = output.match(/Successfully wrote (\d+) bytes/)?.[1];
            return bytes ? `写入 ${bytes} bytes` : "写入完成";
        }
        if (this.toolName === "edit") {
            const replacements = output.match(/Successfully replaced (\d+) block/)?.[1];
            if (replacements) {
                return `替换 ${replacements} 处`;
            }
            const editCount = Array.isArray(this.args?.edits) ? this.args.edits.length : undefined;
            return editCount ? `替换 ${editCount} 处` : "编辑完成";
        }
        if (this.toolName === "bash") {
            const firstLine = lines[0];
            return firstLine ? firstLine.slice(0, 120) : "无输出";
        }
        return lines[0]?.slice(0, 120) ?? "完成";
    }
    createCompactResultComponent() {
        const summary = this.createCompactResultSummary();
        if (!summary) {
            return undefined;
        }
        return new Text(`  ${theme.fg("dim", `⎿  ${summary}`)}`, 0, 0);
    }
    updateArgs(args) {
        this.args = args;
        const nextSummary = summarizeToolArgs(this.toolName, this.args);
        if (nextSummary === this.lastArgsSummary) {
            if (this.expanded) {
                this.displayVersion++;
                this.updateDisplay();
                return true;
            }
            return false;
        }
        this.lastArgsSummary = nextSummary;
        this.displayVersion++;
        this.updateDisplay();
        return true;
    }
    markExecutionStarted() {
        if (this.executionStarted) {
            return;
        }
        this.executionStarted = true;
        this.displayVersion++;
        this.updateDisplay();
        this.ui.requestRender();
    }
    setArgsComplete() {
        if (this.argsComplete) {
            return;
        }
        this.argsComplete = true;
        this.displayVersion++;
        this.updateDisplay();
        this.ui.requestRender();
    }
    updateResult(result, isPartial = false) {
        this.result = result;
        this.isPartial = isPartial;
        if (this.expanded || !this.shouldDeferRenderer() || result.isError) {
            this.displayVersion++;
            this.updateDisplay();
        }
        this.maybeConvertImagesForKitty();
    }
    maybeConvertImagesForKitty() {
        if (!this.expanded && !this.result?.isError) {
            return;
        }
        const caps = getCapabilities();
        if (caps.images !== "kitty")
            return;
        if (!this.result)
            return;
        const imageBlocks = this.result.content.filter((c) => c.type === "image");
        for (let i = 0; i < imageBlocks.length; i++) {
            const img = imageBlocks[i];
            if (!img.data || !img.mimeType)
                continue;
            if (img.mimeType === "image/png")
                continue;
            if (this.convertedImages.has(i))
                continue;
            const index = i;
            convertToPng(img.data, img.mimeType).then((converted) => {
                if (converted) {
                    this.convertedImages.set(index, converted);
                    this.displayVersion++;
                    this.updateDisplay();
                    this.ui.requestRender();
                }
            });
        }
    }
    setExpanded(expanded) {
        if (this.expanded === expanded) {
            return;
        }
        this.expanded = expanded;
        this.displayVersion++;
        this.updateDisplay();
        if (expanded) {
            this.maybeConvertImagesForKitty();
        }
    }
    setShowImages(show) {
        if (this.showImages === show) {
            return;
        }
        this.showImages = show;
        this.displayVersion++;
        this.updateDisplay();
    }
    setImageWidthCells(width) {
        const nextWidth = Math.max(1, Math.floor(width));
        if (this.imageWidthCells === nextWidth) {
            return;
        }
        this.imageWidthCells = nextWidth;
        this.displayVersion++;
        this.updateDisplay();
    }
    invalidate() {
        super.invalidate();
        this.lastDisplaySignature = "";
        this.lastArgsSummary = "";
        this.updateDisplay();
    }
    render(width) {
        if (this.hideComponent) {
            return [];
        }
        return super.render(width);
    }
    updateDisplay() {
        const signature = [
            this.displayVersion,
            this.expanded ? "expanded" : "collapsed",
            this.showImages ? "images" : "no-images",
            this.imageWidthCells,
            this.convertedImages.size,
        ].join("|");
        if (signature === this.lastDisplaySignature) {
            return;
        }
        this.lastDisplaySignature = signature;
        let hasContent = false;
        const wasHidden = this.hideComponent;
        this.hideComponent = false;
        if (this.shouldDeferRenderer()) {
            if (wasHidden &&
                this.contentBox.children.length === 0 &&
                this.selfRenderContainer.children.length === 0 &&
                this.contentText.text === "" &&
                this.imageComponents.length === 0 &&
                this.imageSpacers.length === 0) {
                this.hideComponent = true;
                return;
            }
            this.contentBox.clear();
            this.selfRenderContainer.clear();
            this.contentText.setText("");
            this.clearImageComponents();
            this.hideComponent = true;
            return;
        }
        if (this.hasRendererDefinition()) {
            const renderContainer = this.getRenderShell() === "self" ? this.selfRenderContainer : this.contentBox;
            renderContainer.clear();
            renderContainer.addChild(new Text(this.formatToolTitle(), 0, 0));
            hasContent = true;
            const compactResultFlow = this.usesCompactResultFlow();
            if (compactResultFlow) {
                const component = this.createCompactResultComponent();
                if (component) {
                    renderContainer.addChild(component);
                    hasContent = true;
                }
            }
            else {
                const callRenderer = this.getCallRenderer();
                if (!callRenderer) {
                    hasContent = true;
                }
                else {
                    try {
                        const component = callRenderer(this.args, theme, this.getRenderContext(this.callRendererComponent));
                        this.callRendererComponent = component;
                        renderContainer.addChild(component);
                        hasContent = true;
                    }
                    catch {
                        this.callRendererComponent = undefined;
                        renderContainer.addChild(this.createCallFallback());
                        hasContent = true;
                    }
                }
            }
            if (this.result && !compactResultFlow) {
                const resultRenderer = this.getResultRenderer();
                if (!resultRenderer) {
                    const component = this.createResultFallback();
                    if (component) {
                        renderContainer.addChild(component);
                        hasContent = true;
                    }
                }
                else {
                    try {
                        const component = resultRenderer({ content: this.result.content, details: this.result.details }, { expanded: this.expanded, isPartial: this.isPartial }, theme, this.getRenderContext(this.resultRendererComponent));
                        this.resultRendererComponent = component;
                        renderContainer.addChild(component);
                        hasContent = true;
                    }
                    catch {
                        this.resultRendererComponent = undefined;
                        const component = this.createResultFallback();
                        if (component) {
                            renderContainer.addChild(component);
                            hasContent = true;
                        }
                    }
                }
            }
        }
        else {
            this.contentText.setText(this.formatToolExecution());
            hasContent = true;
        }
        this.clearImageComponents();
        if (this.result) {
            const imageBlocks = this.result.content.filter((c) => c.type === "image");
            const caps = getCapabilities();
            for (let i = 0; i < imageBlocks.length; i++) {
                const img = imageBlocks[i];
                if (caps.images && this.showImages && img.data && img.mimeType) {
                    const converted = this.convertedImages.get(i);
                    const imageData = converted?.data ?? img.data;
                    const imageMimeType = converted?.mimeType ?? img.mimeType;
                    if (caps.images === "kitty" && imageMimeType !== "image/png")
                        continue;
                    const imageComponent = new Image(imageData, imageMimeType, { fallbackColor: (s) => theme.fg("toolOutput", s) }, { maxWidthCells: this.imageWidthCells });
                    this.imageComponents.push(imageComponent);
                    this.addChild(imageComponent);
                }
            }
        }
        if (this.hasRendererDefinition() && !hasContent && this.imageComponents.length === 0) {
            this.hideComponent = true;
        }
    }
    shouldDeferRenderer() {
        return this.hasRendererDefinition() && !this.expanded && !this.result?.isError;
    }
    clearImageComponents() {
        for (const img of this.imageComponents) {
            this.removeChild(img);
        }
        this.imageComponents = [];
        for (const spacer of this.imageSpacers) {
            this.removeChild(spacer);
        }
        this.imageSpacers = [];
    }
    getTextOutput() {
        return getRenderedTextOutput(this.result, this.showImages);
    }
    formatToolExecution() {
        let text = this.formatToolTitle();
        const content = JSON.stringify(this.args, null, 2);
        if (content) {
            text += `\n${theme.fg("dim", "参数")} ${theme.fg("toolOutput", content)}`;
        }
        const output = this.getTextOutput();
        if (output) {
            text += `\n${theme.fg("dim", "输出")} ${theme.fg("toolOutput", output)}`;
        }
        return text;
    }
    formatToolTitle() {
        const icon = this.isPartial ? "●" : this.result?.isError ? "✕" : "✓";
        const color = this.isPartial ? "accent" : this.result?.isError ? "error" : "success";
        const summary = summarizeToolArgs(this.toolName, this.args);
        const displayName = this.toolName === "bash" ? "Bash" : this.toolName;
        const title = summary ? `${displayName}(${summary})` : displayName;
        return `${theme.fg(color, icon)} ${theme.fg("toolTitle", title)}`;
    }
}
//# sourceMappingURL=tool-execution.js.map
