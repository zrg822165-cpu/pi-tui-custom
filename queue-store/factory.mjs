import { QueueStore } from "./queue-store.mjs";

export function createQueueStore(host) {
    return new QueueStore(host);
}

