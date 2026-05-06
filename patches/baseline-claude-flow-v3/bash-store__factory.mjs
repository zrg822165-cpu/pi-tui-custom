import { BashStore } from "./bash-store.mjs";

export function createBashStore(host) {
    return new BashStore(host);
}

