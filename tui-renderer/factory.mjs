import { attachPiInteractiveRenderer } from "./pi-interactive-renderer.mjs";

export function createTuiRenderer(mode, actions = {}) {
    const renderer = (process.env.PI_TUI_RENDERER ?? "pi").toLowerCase();
    if (renderer !== "pi" && renderer !== "builtin") {
        throw new Error(`Unsupported PI_TUI_RENDERER=${renderer}. Only "pi" is available in the JS bridge.`);
    }
    return attachPiInteractiveRenderer(mode, actions);
}

