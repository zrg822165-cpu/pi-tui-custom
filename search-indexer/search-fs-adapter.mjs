import { existsSync, readFileSync, readdirSync, statSync } from "fs";

const defaultOperations = {
    exists: existsSync,
    stat: statSync,
    readdir: readdirSync,
    readFile: (p) => readFileSync(p, "utf-8"),
};

export class SearchFsAdapter {
    operations;
    constructor(options = {}) {
        this.operations = options.operations ?? defaultOperations;
    }
    exists(path) {
        return this.operations.exists(path);
    }
    stat(path) {
        return this.operations.stat(path);
    }
    readdir(path) {
        return this.operations.readdir(path);
    }
    readFile(path) {
        return this.operations.readFile(path);
    }
    glob(pattern, searchPath, options) {
        return this.operations.glob?.(pattern, searchPath, options);
    }
    hasGlob() {
        return typeof this.operations.glob === "function";
    }
    async isDirectory(path) {
        try {
            return (await this.stat(path)).isDirectory();
        }
        catch {
            if (typeof this.operations.isDirectory === "function") {
                return this.operations.isDirectory(path);
            }
            throw new Error(`Path not found: ${path}`);
        }
    }
    async readFileLines(path) {
        const content = await this.readFile(path);
        return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    }
}
