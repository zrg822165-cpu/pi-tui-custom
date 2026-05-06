import type { Component } from "../tui.js";
import type { Container } from "../tui.js";
/**
 * Spacer component that renders empty lines
 */
export declare class Spacer implements Component {
    private lines;
    parentContainer?: Container;
    __piRenderCacheSafe: boolean;
    constructor(lines?: number);
    setLines(lines: number): void;
    invalidate(): void;
    render(_width: number): string[];
}
//# sourceMappingURL=spacer.d.ts.map
