import { execSync, spawn, spawnSync } from "node:child_process";

export function runProcessSync(command, args = [], options = {}) {
    return spawnSync(command, args, options);
}

export function runShellCommandSync(command, options = {}) {
    return execSync(command, options);
}

export function startNodeProcess(command, args = [], options = {}) {
    return spawn(command, args, options);
}
