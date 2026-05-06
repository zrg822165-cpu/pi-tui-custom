import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();

const checks = [
    {
        name: "patch-engine",
        env: "PI_PATCH_ENGINE_COMMAND",
        exe: "target/release/pi-patch-engine.exe",
        script: "scripts/check-rust-patch-engine-parity.mjs",
    },
    {
        name: "search-core",
        env: "PI_SEARCH_CORE_COMMAND",
        exe: "target/release/pi-search-core.exe",
        script: "scripts/check-rust-search-core-parity.mjs",
    },
    {
        name: "queue-core",
        env: "PI_QUEUE_CORE_COMMAND",
        exe: "target/release/pi-queue-core.exe",
        script: "scripts/check-rust-queue-core-parity.mjs",
    },
    {
        name: "event-core",
        env: "PI_EVENT_CORE_COMMAND",
        exe: "target/release/pi-event-core.exe",
        script: "scripts/check-rust-event-core-parity.mjs",
    },
    {
        name: "transcript-core",
        env: "PI_TRANSCRIPT_CORE_COMMAND",
        exe: "target/release/pi-transcript-core.exe",
        script: "scripts/check-rust-transcript-core-parity.mjs",
    },
    {
        name: "ui-core",
        env: "PI_UI_CORE_COMMAND",
        exe: "target/release/pi-ui-core.exe",
        script: "scripts/check-rust-ui-core-parity.mjs",
    },
];

const cargo = spawnSync("cargo", ["build", "--release"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, Path: `${process.env.USERPROFILE}\\.cargo\\bin;${process.env.Path}` },
});
if (cargo.status !== 0) {
    process.stderr.write(cargo.stdout);
    process.stderr.write(cargo.stderr);
    process.exit(cargo.status ?? 1);
}

const results = [];
for (const check of checks) {
    const env = {
        ...process.env,
        [check.env]: path.join(root, check.exe),
    };
    const result = spawnSync(process.execPath, [check.script], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
        env,
    });
    if (result.status !== 0) {
        process.stderr.write(result.stdout);
        process.stderr.write(result.stderr);
        process.exit(result.status ?? 1);
    }
    const parsed = JSON.parse(result.stdout);
    results.push({ name: check.name, checked: parsed.checked });
}

console.log(JSON.stringify({
    ok: true,
    checks: results,
    total: results.reduce((sum, item) => sum + item.checked, 0),
}, null, 2));
