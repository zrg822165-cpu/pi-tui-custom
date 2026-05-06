import { Text } from "@mariozechner/pi-tui";

export class ExpandableText extends Text {
    getCollapsedText;
    getExpandedText;

    constructor(getCollapsedText, getExpandedText, expanded = false, paddingX = 0, paddingY = 0) {
        super(expanded ? getExpandedText() : getCollapsedText(), paddingX, paddingY);
        this.getCollapsedText = getCollapsedText;
        this.getExpandedText = getExpandedText;
    }

    setExpanded(expanded) {
        this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
    }
}
