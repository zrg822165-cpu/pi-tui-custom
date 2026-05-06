import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".pi", "patches"]);

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (dir === root && SKIP_DIRS.has(entry.name)) {
            continue;
        }
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(filePath));
        }
        else {
            out.push(filePath);
        }
    }
    return out;
}

const files = walk(root).filter((filePath) => /\.(mjs|js)$/.test(filePath));
let failed = 0;
for (const filePath of files) {
    const result = spawnSync(process.execPath, ["--check", filePath], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
    });
    if (result.status !== 0) {
        failed += 1;
        console.error(`node --check failed: ${path.relative(root, filePath)}`);
        if (result.stderr) {
            console.error(result.stderr.trim());
        }
    }
}

if (failed > 0) {
    process.exitCode = 1;
}
else {
    console.log(`checked=${files.length}`);
}
