import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runProcessSync } from "../shell-executor/index.mjs";

export function openExternalEditor(host) {
    const editorCmd = process.env.VISUAL || process.env.EDITOR;
    if (!editorCmd) {
        host.showWarning("No editor configured. Set $VISUAL or $EDITOR environment variable.");
        return;
    }
    const currentText = host.editor.getExpandedText?.() ?? host.editor.getText();
    const tmpFile = path.join(os.tmpdir(), `pi-editor-${Date.now()}.pi.md`);
    try {
        fs.writeFileSync(tmpFile, currentText, "utf-8");
        host.ui.stop();
        const [editor, ...editorArgs] = editorCmd.split(" ");
        const result = runProcessSync(editor, [...editorArgs, tmpFile], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });
        if (result.status === 0) {
            const newContent = fs.readFileSync(tmpFile, "utf-8").replace(/\n$/, "");
            host.editor.setText(newContent);
        }
    }
    finally {
        try {
            fs.unlinkSync(tmpFile);
        }
        catch {
        }
        host.ui.start();
        host.ui.requestRender(true);
    }
}
