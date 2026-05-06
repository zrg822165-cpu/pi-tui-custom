import { ArminComponent, DaxnutsComponent, DynamicBorder, EarendilAnnouncementComponent } from "../tui-renderer/index.mjs";
import { Markdown, Spacer, Text, visibleWidth } from "@mariozechner/pi-tui";
import { APP_NAME, getDebugLogPath } from "../node_modules/@mariozechner/pi-coding-agent/dist/config.js";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { getSession } from "../runtime-host-adapter/index.mjs";
import * as fs from "node:fs";
import * as path from "node:path";

export class NoticeStore {
    host;
    constructor(host) {
        this.host = host;
    }
    get ui() {
        return this.host.ui;
    }
    get rendererHost() {
        return this.host.rendererHost;
    }
    getSession() {
        return getSession(this.host);
    }
    appendSpacer() {
        this.rendererHost.appendChat(new Spacer(1));
    }
    appendText(text, paddingX = 1, paddingY = 0) {
        this.rendererHost.appendChat(new Text(text, paddingX, paddingY));
    }
    requestRender() {
        this.ui.requestRender();
    }
    showNewVersionNotification(newVersion) {
        const action = theme.fg("accent", `${APP_NAME} update`);
        const updateInstruction = theme.fg("muted", `New version ${newVersion} is available. Run `) + action;
        const changelogUrl = theme.fg("accent", "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/CHANGELOG.md");
        const changelogLine = theme.fg("muted", "Changelog: ") + changelogUrl;
        this.appendSpacer();
        this.rendererHost.appendChat(new DynamicBorder((text) => theme.fg("warning", text)));
        this.appendText(`${theme.bold(theme.fg("warning", "Update Available"))}\n${updateInstruction}\n${changelogLine}`);
        this.rendererHost.appendChat(new DynamicBorder((text) => theme.fg("warning", text)));
        this.requestRender();
    }
    showPackageUpdateNotification(packages) {
        const action = theme.fg("accent", `${APP_NAME} update`);
        const updateInstruction = theme.fg("muted", "Package updates are available. Run ") + action;
        const packageLines = packages.map((pkg) => `- ${pkg}`).join("\n");
        this.appendSpacer();
        this.rendererHost.appendChat(new DynamicBorder((text) => theme.fg("warning", text)));
        this.appendText(`${theme.bold(theme.fg("warning", "Package Updates Available"))}\n${updateInstruction}\n${theme.fg("muted", "Packages:")}\n${packageLines}`);
        this.rendererHost.appendChat(new DynamicBorder((text) => theme.fg("warning", text)));
        this.requestRender();
    }
    showMarkdownPanel(title, markdown) {
        this.appendSpacer();
        this.rendererHost.appendChat(new DynamicBorder());
        this.appendText(theme.bold(theme.fg("accent", title)));
        this.appendSpacer();
        this.rendererHost.appendChat(new Markdown(markdown.trim(), 1, 1, this.host.getMarkdownThemeWithSettings()));
        this.rendererHost.appendChat(new DynamicBorder());
        this.requestRender();
    }
    showSessionName(currentName) {
        if (!currentName) {
            return;
        }
        this.appendSpacer();
        this.appendText(theme.fg("dim", `Session name: ${currentName}`));
        this.requestRender();
    }
    showSessionNameSet(name) {
        this.appendSpacer();
        this.appendText(theme.fg("dim", `Session name set: ${name}`));
        this.requestRender();
    }
    showSessionInfo(info) {
        this.appendSpacer();
        this.appendText(info);
        this.requestRender();
    }
    showDebugLog() {
        const width = this.ui.terminal.columns;
        const height = this.ui.terminal.rows;
        const allLines = this.ui.render(width);
        const debugLogPath = getDebugLogPath();
        const debugData = [
            `Debug output at ${new Date().toISOString()}`,
            `Terminal: ${width}x${height}`,
            `Total lines: ${allLines.length}`,
            "",
            "=== All rendered lines with visible widths ===",
            ...allLines.map((line, idx) => {
                const vw = visibleWidth(line);
                const escaped = JSON.stringify(line);
                return `[${idx}] (w=${vw}) ${escaped}`;
            }),
            "",
            "=== Agent messages (JSONL) ===",
            ...(this.getSession()?.messages ?? []).map((msg) => JSON.stringify(msg)),
            "",
        ].join("\n");
        fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
        fs.writeFileSync(debugLogPath, debugData);
        this.appendSpacer();
        this.appendText(`${theme.fg("accent", "✓ Debug log written")}\n${theme.fg("muted", debugLogPath)}`, 1, 1);
        this.requestRender();
    }
    showNewSessionStarted() {
        this.appendSpacer();
        this.appendText(`${theme.fg("accent", "✓ New session started")}`, 1, 1);
        this.requestRender();
    }
    showArminSaysHi() {
        this.appendSpacer();
        this.rendererHost.appendChat(new ArminComponent(this.ui));
        this.requestRender();
    }
    showDementedDelves() {
        this.appendSpacer();
        this.rendererHost.appendChat(new EarendilAnnouncementComponent());
        this.requestRender();
    }
    showDaxnuts() {
        this.appendSpacer();
        this.rendererHost.appendChat(new DaxnutsComponent(this.ui));
        this.requestRender();
    }
}
