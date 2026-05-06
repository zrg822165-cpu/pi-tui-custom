import path from "path";

function defaultResolveToCwd(value, cwd) {
    if (!value || value === ".") {
        return cwd;
    }
    if (path.isAbsolute(value)) {
        return value;
    }
    return path.resolve(cwd, value);
}

export class SearchPathAdapter {
    cwd;
    resolveToCwd;
    constructor(cwd, options = {}) {
        this.cwd = cwd;
        this.resolveToCwd = options.resolveToCwd ?? defaultResolveToCwd;
    }
    resolvePath(value) {
        return this.resolveToCwd(value || ".", this.cwd);
    }
    toPosixPath(value) {
        return value.split(path.sep).join("/");
    }
    formatMatchPath(searchPath, filePath, isDirectory) {
        if (isDirectory) {
            const relative = path.relative(searchPath, filePath);
            if (relative && !relative.startsWith("..")) {
                return relative.replace(/\\/g, "/");
            }
        }
        return path.basename(filePath);
    }
    relativizeFoundPath(searchPath, rawLine) {
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line)
            return undefined;
        const hadTrailingSlash = line.endsWith("/") || line.endsWith("\\");
        let relativePath = line;
        if (line.startsWith(searchPath)) {
            relativePath = line.slice(searchPath.length + 1);
        }
        else {
            relativePath = path.relative(searchPath, line);
        }
        if (hadTrailingSlash && !relativePath.endsWith("/"))
            relativePath += "/";
        return this.toPosixPath(relativePath);
    }
    relativizeGlobPath(searchPath, filePath) {
        if (filePath.startsWith(searchPath))
            return this.toPosixPath(filePath.slice(searchPath.length + 1));
        return this.toPosixPath(path.relative(searchPath, filePath));
    }
    join(...parts) {
        return path.join(...parts);
    }
}
