import { UIStateStore } from "./ui-state-store.mjs";

export function createUIStateStore(host) {
    return new UIStateStore(host);
}

