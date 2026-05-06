export const SEARCH_INDEXER_PROTOCOL_VERSION = 1;

export const SEARCH_INDEXER_SURFACE = Object.freeze({
    text: [
        "searchText",
        "readMatchContext",
    ],
    files: [
        "findFiles",
        "listDirectory",
    ],
    lifecycle: [
        "warmup",
        "invalidate",
    ],
});

export const SEARCH_PROCESS_ADAPTER_SURFACE = Object.freeze({
    tools: [
        "getToolPath",
    ],
    processes: [
        "runRipgrepJson",
        "runFd",
    ],
});

export const SEARCH_RESULT_FORMATTER_SURFACE = Object.freeze({
    common: [
        "maxBytesLabel",
        "truncateOutput",
    ],
    results: [
        "formatTextSearch",
        "formatFindResults",
        "formatDirectoryResults",
    ],
});

export const SEARCH_PATH_ADAPTER_SURFACE = Object.freeze({
    paths: [
        "resolvePath",
        "toPosixPath",
        "formatMatchPath",
        "relativizeFoundPath",
        "relativizeGlobPath",
        "join",
    ],
});

export const SEARCH_FS_ADAPTER_SURFACE = Object.freeze({
    fs: [
        "exists",
        "stat",
        "readdir",
        "readFile",
        "glob",
        "hasGlob",
        "isDirectory",
        "readFileLines",
    ],
});

export const SEARCH_CONTEXT_FORMATTER_SURFACE = Object.freeze({
    cache: [
        "getFileLines",
    ],
    context: [
        "formatBlock",
        "formatSingleLine",
    ],
});

export const SEARCH_QUERY_BUILDER_SURFACE = Object.freeze({
    ripgrep: [
        "buildRipgrepArgs",
    ],
    fd: [
        "buildFdArgs",
    ],
});
