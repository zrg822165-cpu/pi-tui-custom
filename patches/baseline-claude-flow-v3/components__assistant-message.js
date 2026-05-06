import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const ASSISTANT_PREFIX_WIDTH = 2;
const ASSISTANT_CONTINUATION_PREFIX = "  ";
let assistantBulletPrefix;
function getAssistantBulletPrefix() {
    if (assistantBulletPrefix === undefined) {
        assistantBulletPrefix = `${theme.fg("accent", "●")} `;
    }
    return assistantBulletPrefix;
}
class AssistantMarkdown extends Markdown {
    prefixedWidth;
    prefixedSourceLines;
    prefixedLines;
    invalidate() {
        this.prefixedWidth = undefined;
        this.prefixedSourceLines = undefined;
        this.prefixedLines = undefined;
        super.invalidate();
    }
    render(width) {
        const prefixWidth = ASSISTANT_PREFIX_WIDTH;
        const lines = super.render(Math.max(1, width - prefixWidth));
        if (lines.length === 0) {
            return [];
        }
        if (this.prefixedLines && this.prefixedWidth === width && this.prefixedSourceLines === lines) {
            return this.prefixedLines;
        }
        const bullet = getAssistantBulletPrefix();
        const prefixedLines = lines.map((line, index) => `${index === 0 ? bullet : ASSISTANT_CONTINUATION_PREFIX}${line}`);
        this.prefixedWidth = width;
        this.prefixedSourceLines = lines;
        this.prefixedLines = prefixedLines;
        return prefixedLines;
    }
}
/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
    contentContainer;
    hideThinkingBlock;
    markdownTheme;
    hiddenThinkingLabel;
    lastMessage;
    hasToolCalls = false;
    singleTextComponent = undefined;
    singleTextValue = "";
    constructor(message, hideThinkingBlock = false, markdownTheme = getMarkdownTheme(), hiddenThinkingLabel = "Thinking...") {
        super();
        this.hideThinkingBlock = hideThinkingBlock;
        this.markdownTheme = markdownTheme;
        this.hiddenThinkingLabel = hiddenThinkingLabel;
        // Container for text/thinking content
        this.contentContainer = new Container();
        this.addChild(this.contentContainer);
        if (message) {
            this.updateContent(message);
        }
    }
    invalidate() {
        super.invalidate();
        if (this.lastMessage) {
            this.updateContent(this.lastMessage);
        }
    }
    setHideThinkingBlock(hide) {
        this.hideThinkingBlock = hide;
        if (this.lastMessage) {
            this.updateContent(this.lastMessage);
        }
    }
    setHiddenThinkingLabel(label) {
        this.hiddenThinkingLabel = label;
        if (this.lastMessage) {
            this.updateContent(this.lastMessage);
        }
    }
    render(width) {
        const lines = [...super.render(width)];
        if (this.hasToolCalls || lines.length === 0) {
            return lines;
        }
        lines[0] = OSC133_ZONE_START + lines[0];
        lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
        return lines;
    }
    updateContent(message) {
        this.lastMessage = message;
        const singleText = message.content.length === 1 && message.content[0]?.type === "text"
            ? message.content[0].text.trim()
            : "";
        if (singleText && message.stopReason !== "aborted" && message.stopReason !== "error") {
            this.hasToolCalls = false;
            if (!this.singleTextComponent) {
                this.contentContainer.clear();
                this.singleTextComponent = new AssistantMarkdown(singleText, 0, 0, this.markdownTheme);
                this.contentContainer.addChild(this.singleTextComponent);
            }
            else if (singleText !== this.singleTextValue) {
                this.singleTextComponent.setText(singleText);
            }
            this.singleTextValue = singleText;
            return;
        }
        this.singleTextComponent = undefined;
        this.singleTextValue = "";
        // Clear content container
        this.contentContainer.clear();
        const hasToolCallContent = message.content.some((c) => c.type === "toolCall");
        const hasVisibleContent = message.content.some((c) => (c.type === "text" && c.text.trim()) || (!hasToolCallContent && c.type === "thinking" && c.thinking.trim()));
        let prefixedFirstText = false;
        // Render content in order
        for (let i = 0; i < message.content.length; i++) {
            const content = message.content[i];
            if (content.type === "text" && content.text.trim()) {
                // Assistant text messages with no background - trim the text
                // Keep the transcript compact: no top Spacer, no vertical padding.
                const text = content.text.trim();
                if (!prefixedFirstText) {
                    this.contentContainer.addChild(new AssistantMarkdown(text, 0, 0, this.markdownTheme));
                    prefixedFirstText = true;
                }
                else {
                    this.contentContainer.addChild(new Markdown(text, 2, 0, this.markdownTheme));
                }
            }
            else if (content.type === "thinking" && content.thinking.trim()) {
                if (hasToolCallContent) {
                    continue;
                }
                // Add spacing only when another visible assistant content block follows.
                // This avoids a superfluous blank line before separately-rendered tool execution blocks.
                const hasVisibleContentAfter = message.content
                    .slice(i + 1)
                    .some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));
                if (this.hideThinkingBlock) {
                    continue;
                }
                else {
                    const thinkingComponent = new Markdown(`  ${content.thinking.trim()}`, 0, 0, this.markdownTheme, {
                        color: (text) => theme.fg("thinkingText", text),
                        italic: true,
                    });
                    this.contentContainer.addChild(thinkingComponent);
                }
            }
        }
        // Check if aborted - show after partial content
        // But only if there are no tool calls (tool execution components will show the error)
        const hasToolCalls = message.content.some((c) => c.type === "toolCall");
        this.hasToolCalls = hasToolCalls;
        if (!hasToolCalls) {
            if (message.stopReason === "aborted") {
                const abortMessage = message.errorMessage && message.errorMessage !== "Request was aborted"
                    ? message.errorMessage
                    : "Operation aborted";
                this.contentContainer.addChild(new Text(`${hasVisibleContent ? "  " : ""}${theme.fg("error", abortMessage)}`, 0, 0));
            }
            else if (message.stopReason === "error") {
                const errorMsg = message.errorMessage || "Unknown error";
                this.contentContainer.addChild(new Text(`${hasVisibleContent ? "  " : ""}${theme.fg("error", `Error: ${errorMsg}`)}`, 0, 0));
            }
        }
    }
}
//# sourceMappingURL=assistant-message.js.map
