/**
 * Spacer component that renders empty lines
 */
export class Spacer {
    lines;
    parentContainer;
    __piRenderCacheSafe = true;
    constructor(lines = 1) {
        this.lines = lines;
    }
    setLines(lines) {
        if (this.lines === lines) {
            return;
        }
        this.lines = lines;
        this.parentContainer?.markDirty?.();
    }
    invalidate() {
        this.parentContainer?.markDirty?.();
    }
    render(_width) {
        const result = [];
        for (let i = 0; i < this.lines; i++) {
            result.push("");
        }
        return result;
    }
}
//# sourceMappingURL=spacer.js.map
