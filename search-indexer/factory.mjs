import { RipgrepSearchIndexer } from "./ripgrep-search-indexer.mjs";

export function createSearchIndexer(cwd, options) {
    return new RipgrepSearchIndexer(cwd, options);
}
