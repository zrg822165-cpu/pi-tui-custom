import { TranscriptStore } from "./transcript-store.mjs";
import { TranscriptHostAdapter } from "./host-adapter.mjs";

export function createTranscriptStore(host, sessionStore) {
    return new TranscriptStore(new TranscriptHostAdapter(host), sessionStore);
}
