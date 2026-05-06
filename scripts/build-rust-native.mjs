import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cargo = spawnSync("cargo", ["build", "-p", "pi-core-native", "--release"], {
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

const source = path.join(root, "target", "release", "pi_core_native.dll");
const target = path.join(root, "target", "release", "pi_core_native.node");
if (!existsSync(source)) {
    throw new Error(`Native DLL not found: ${source}`);
}
copyFileSync(source, target);
console.log(JSON.stringify({ ok: true, target }, null, 2));
