import { ToolFlowStore } from "./tool-flow-store.mjs";

export function createToolFlowStore(host) {
    return new ToolFlowStore(host);
}

