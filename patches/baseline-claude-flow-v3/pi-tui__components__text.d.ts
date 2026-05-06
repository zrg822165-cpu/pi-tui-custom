import type { Component } from "../tui.js";
import type { Container } from "../tui.js";
/**
 * Text component - displays multi-line text with word wrapping
 */
export declare class Text implements Component {
    private text;
    private paddingX;
    private paddingY;
    private customBgFn?;
    private cachedText?;
    private cachedWidth?;
    private cachedLines?;
    parentContainer?: Container;
    __piRenderCacheSafe: boolean;
    __piDirtyVersion: number;
    constructor(text?: string, paddingX?: number, paddingY?: number, customBgFn?: (text: string) => string);
    setText(text: string): void;
    setCustomBgFn(customBgFn?: (text: string) => string): void;
    invalidate(): void;
    render(width: number): string[];
}
//# sourceMappingURL=text.d.ts.map
