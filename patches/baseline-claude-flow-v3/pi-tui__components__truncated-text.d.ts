import type { Component } from "../tui.js";
import type { Container } from "../tui.js";
/**
 * Text component that truncates to fit viewport width
 */
export declare class TruncatedText implements Component {
    private text;
    private paddingX;
    private paddingY;
    parentContainer?: Container;
    __piRenderCacheSafe: boolean;
    constructor(text: string, paddingX?: number, paddingY?: number);
    invalidate(): void;
    render(width: number): string[];
}
//# sourceMappingURL=truncated-text.d.ts.map
