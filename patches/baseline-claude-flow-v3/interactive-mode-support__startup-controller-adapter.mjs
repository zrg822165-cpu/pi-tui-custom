import { Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { DynamicBorder } from "../tui-renderer/index.mjs";

export function showStartupNoticesIfNeeded(host) {
    if (host.startupNoticesShown) {
        return;
    }
    host.startupNoticesShown = true;
    if (!host.changelogMarkdown) {
        return;
    }
    if (host.rendererHost.hasChatChildren()) {
        host.rendererHost.appendChat(new Spacer(1));
    }
    host.rendererHost.appendChat(new DynamicBorder());
    if (host.settingsManager.getCollapseChangelog()) {
        const versionMatch = host.changelogMarkdown.match(/##\s+\[?(\d+\.\d+\.\d+)\]?/);
        const latestVersion = versionMatch ? versionMatch[1] : host.version;
        const condensedText = `Updated to v${latestVersion}. Use ${host.theme.bold("/changelog")} to view full changelog.`;
        host.rendererHost.appendChat(new Text(condensedText, 1, 0));
    }
    else {
        host.rendererHost.appendChat(new Text(host.theme.bold(host.theme.fg("accent", "What's New")), 1, 0));
        host.rendererHost.appendChat(new Spacer(1));
        host.rendererHost.appendChat(new Markdown(host.changelogMarkdown.trim(), 1, 0, host.getMarkdownThemeWithSettings()));
        host.rendererHost.appendChat(new Spacer(1));
    }
    host.rendererHost.appendChat(new DynamicBorder());
}

export function applyRuntimeSettings(host) {
    host.footer.setSession(host.sessionStore.getFooterSession());
    host.footer.setAutoCompactEnabled(host.sessionStore.getAutoCompactionEnabled());
    host.footerDataProvider.setCwd(host.sessionStore.getCwd());
    host.hideThinkingBlock = host.settingsManager.getHideThinkingBlock();
    host.ui.setShowHardwareCursor(host.settingsManager.getShowHardwareCursor());
    host.ui.setClearOnShrink(host.settingsManager.getClearOnShrink());
    const editorPaddingX = host.settingsManager.getEditorPaddingX();
    const autocompleteMaxVisible = host.settingsManager.getAutocompleteMaxVisible();
    host.defaultEditor.setPaddingX(editorPaddingX);
    host.defaultEditor.setAutocompleteMaxVisible(autocompleteMaxVisible);
    if (host.editor !== host.defaultEditor) {
        host.editor.setPaddingX?.(editorPaddingX);
        host.editor.setAutocompleteMaxVisible?.(autocompleteMaxVisible);
    }
}

export function showLoadedResources(host, options = {}) {
    const showListing = options.force || host.options.verbose || !host.settingsManager.getQuietStartup();
    const showDiagnostics = showListing || options.showDiagnosticsWhenQuiet === true;
    if (!showListing && !showDiagnostics) {
        return;
    }
    const sectionHeader = (name, color = "mdHeading") => host.theme.fg(color, `[${name}]`);
    const formatCompactList = (items, formatOptions) => {
        const labels = items.map((item) => item.trim()).filter((item) => item.length > 0);
        if (formatOptions?.sort !== false) {
            labels.sort((a, b) => a.localeCompare(b));
        }
        return host.theme.fg("dim", `  ${labels.join(", ")}`);
    };
    const addLoadedSection = (name, collapsedBody, expandedBody = collapsedBody, color = "mdHeading") => {
        const section = new host.ExpandableText(() => `${sectionHeader(name, color)}\n${collapsedBody}`, () => `${sectionHeader(name, color)}\n${expandedBody}`, host.getStartupExpansionState(), 0, 0);
        host.rendererHost.appendChat(section);
        host.rendererHost.appendChat(new Spacer(1));
    };
    const skillsResult = host.sessionStore.getSkillsResult();
    const promptsResult = host.sessionStore.getPromptsResult();
    const themesResult = host.sessionStore.getThemesResult();
    const extensions = options.extensions ??
        host.sessionStore.getExtensionsResult().extensions.map((extension) => ({
            path: extension.path,
            sourceInfo: extension.sourceInfo,
        }));
    const sourceInfos = new Map();
    for (const extension of extensions) {
        if (extension.sourceInfo) {
            sourceInfos.set(extension.path, extension.sourceInfo);
        }
    }
    for (const skill of skillsResult.skills) {
        if (skill.sourceInfo) {
            sourceInfos.set(skill.filePath, skill.sourceInfo);
        }
    }
    for (const prompt of promptsResult.prompts) {
        if (prompt.sourceInfo) {
            sourceInfos.set(prompt.filePath, prompt.sourceInfo);
        }
    }
    for (const loadedTheme of themesResult.themes) {
        if (loadedTheme.sourcePath && loadedTheme.sourceInfo) {
            sourceInfos.set(loadedTheme.sourcePath, loadedTheme.sourceInfo);
        }
    }
    if (showListing) {
        const contextFiles = host.sessionStore.getAgentsFilesResult().agentsFiles;
        if (contextFiles.length > 0) {
            host.rendererHost.appendChat(new Spacer(1));
            const contextList = contextFiles.map((f) => host.theme.fg("dim", `  ${host.formatDisplayPath(f.path)}`)).join("\n");
            const contextCompactList = formatCompactList(contextFiles.map((contextFile) => host.formatContextPath(contextFile.path)), { sort: false });
            addLoadedSection("Context", contextCompactList, contextList);
        }
        const skills = skillsResult.skills;
        if (skills.length > 0) {
            const groups = host.buildScopeGroups(skills.map((skill) => ({ path: skill.filePath, sourceInfo: skill.sourceInfo })));
            const skillList = host.formatScopeGroups(groups, {
                formatPath: (item) => host.formatDisplayPath(item.path),
                formatPackagePath: (item) => host.getShortPath(item.path, item.sourceInfo),
            });
            const skillCompactList = formatCompactList(skills.map((skill) => skill.name));
            addLoadedSection("Skills", skillCompactList, skillList);
        }
        const templates = host.sessionStore.getPromptTemplates();
        if (templates.length > 0) {
            const groups = host.buildScopeGroups(templates.map((template) => ({ path: template.filePath, sourceInfo: template.sourceInfo })));
            const templateByPath = new Map(templates.map((t) => [t.filePath, t]));
            const templateList = host.formatScopeGroups(groups, {
                formatPath: (item) => {
                    const template = templateByPath.get(item.path);
                    return template ? `/${template.name}` : host.formatDisplayPath(item.path);
                },
                formatPackagePath: (item) => {
                    const template = templateByPath.get(item.path);
                    return template ? `/${template.name}` : host.formatDisplayPath(item.path);
                },
            });
            const promptCompactList = formatCompactList(templates.map((template) => `/${template.name}`));
            addLoadedSection("Prompts", promptCompactList, templateList);
        }
        if (extensions.length > 0) {
            const groups = host.buildScopeGroups(extensions);
            const extList = host.formatScopeGroups(groups, {
                formatPath: (item) => host.formatExtensionDisplayPath(item.path),
                formatPackagePath: (item) => host.formatExtensionDisplayPath(host.getShortPath(item.path, item.sourceInfo)),
            });
            const extensionCompactList = formatCompactList(host.getCompactExtensionLabels(extensions));
            addLoadedSection("Extensions", extensionCompactList, extList, "mdHeading");
        }
        const loadedThemes = themesResult.themes;
        const customThemes = loadedThemes.filter((t) => t.sourcePath);
        if (customThemes.length > 0) {
            const groups = host.buildScopeGroups(customThemes.map((loadedTheme) => ({
                path: loadedTheme.sourcePath,
                sourceInfo: loadedTheme.sourceInfo,
            })));
            const themeList = host.formatScopeGroups(groups, {
                formatPath: (item) => host.formatDisplayPath(item.path),
                formatPackagePath: (item) => host.getShortPath(item.path, item.sourceInfo),
            });
            const themeCompactList = formatCompactList(customThemes.map((loadedTheme) => loadedTheme.name ?? host.getCompactPathLabel(loadedTheme.sourcePath, loadedTheme.sourceInfo)));
            addLoadedSection("Themes", themeCompactList, themeList);
        }
    }
    if (showDiagnostics) {
        const emitDiagnostics = (title, diagnostics) => {
            if (diagnostics.length === 0) {
                return;
            }
            const warningLines = host.formatDiagnostics(diagnostics, sourceInfos);
            host.rendererHost.appendChat(new Text(`${host.theme.fg("warning", title)}\n${warningLines}`, 0, 0));
            host.rendererHost.appendChat(new Spacer(1));
        };
        emitDiagnostics("[Skill conflicts]", skillsResult.diagnostics);
        emitDiagnostics("[Prompt conflicts]", promptsResult.diagnostics);
        const extensionDiagnostics = [];
        const extensionErrors = host.sessionStore.getExtensionsResult().errors;
        for (const error of extensionErrors) {
            extensionDiagnostics.push({ type: "error", message: error.error, path: error.path });
        }
        extensionDiagnostics.push(...host.sessionStore.getExtensionCommandDiagnostics());
        extensionDiagnostics.push(...host.getBuiltInCommandConflictDiagnostics(host.sessionStore.getExtensionRunner()));
        extensionDiagnostics.push(...host.sessionStore.getExtensionShortcutDiagnostics());
        emitDiagnostics("[Extension issues]", extensionDiagnostics);
        emitDiagnostics("[Theme conflicts]", themesResult.diagnostics);
    }
}
