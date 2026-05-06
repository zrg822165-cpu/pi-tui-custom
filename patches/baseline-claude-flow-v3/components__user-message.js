import { Container, Text, visibleWidth } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
    constructor(text, markdownTheme = getMarkdownTheme()) {
        super();
        void markdownTheme;
        const lines = String(text ?? "").split("\n");
        const first = lines.shift() ?? "";
        this.addChild(new Text(`${theme.fg("accent", "❯")} ${theme.fg("userMessageText", first)}`, 0, 0));
        for (const line of lines) {
            this.addChild(new Text(`  ${theme.fg("userMessageText", line)}`, 0, 0));
        }
    }
    render(width) {
        const borderColor = (text) => theme.fg("borderAccent", text);
        if (width < 6) {
            return super.render(width);
        }
        const innerWidth = Math.max(1, width - 4);
        const contentLines = super.render(innerWidth);
        const horizontal = "─".repeat(Math.max(0, width - 2));
        const lines = [
            borderColor(`╭${horizontal}╮`),
            ...contentLines.map((line) => {
                const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(line)));
                return `${borderColor("│")} ${line}${padding} ${borderColor("│")}`;
            }),
            borderColor(`╰${horizontal}╯`),
        ];
        if (lines.length === 0) {
            return lines;
        }
        lines[0] = OSC133_ZONE_START + lines[0];
        lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
        return lines;
    }
}
//# sourceMappingURL=user-message.js.map
