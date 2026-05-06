import { CombinedAutocompleteProvider, fuzzyFilter } from "@mariozechner/pi-tui";
import { BUILTIN_SLASH_COMMANDS } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/slash-commands.js";

export function getBuiltInCommandConflictDiagnostics(extensionRunner) {
    const builtinNames = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));
    return extensionRunner
        .getRegisteredCommands()
        .filter((command) => builtinNames.has(command.name))
        .map((command) => ({
        type: "warning",
        message: command.invocationName === command.name
            ? `Extension command '/${command.name}' conflicts with built-in interactive command. Skipping in autocomplete.`
            : `Extension command '/${command.name}' conflicts with built-in interactive command. Available as '/${command.invocationName}'.`,
        path: command.sourceInfo.path,
    }));
}

export function createBaseAutocompleteProvider(host) {
    const slashCommands = BUILTIN_SLASH_COMMANDS.map((command) => {
        return {
            name: command.name,
            description: command.description,
        };
    });
    const modelCommand = slashCommands.find((command) => command.name === "model");
    if (modelCommand) {
        modelCommand.getArgumentCompletions = (prefix) => {
            const models = host.sessionStore.hasScopedModels()
                ? host.sessionStore.getScopedModelValues()
                : host.sessionStore.getAvailableModels();
            if (models.length === 0)
                return null;
            const items = models.map((m) => ({
                id: m.id,
                provider: m.provider,
                label: `${m.provider}/${m.id}`,
            }));
            const filtered = fuzzyFilter(items, prefix, (item) => `${item.id} ${item.provider}`);
            if (filtered.length === 0)
                return null;
            return filtered.map((item) => ({
                value: item.label,
                label: item.id,
                description: item.provider,
            }));
        };
    }
    const templateCommands = host.sessionStore.getPromptTemplates().map((cmd) => ({
        name: cmd.name,
        description: host.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
        ...(cmd.argumentHint && { argumentHint: cmd.argumentHint }),
    }));
    const builtinCommandNames = new Set(slashCommands.map((c) => c.name));
    const extensionCommands = host.sessionStore.getExtensionRunner()
        .getRegisteredCommands()
        .filter((cmd) => !builtinCommandNames.has(cmd.name))
        .map((cmd) => ({
        name: cmd.invocationName,
        description: host.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
        getArgumentCompletions: cmd.getArgumentCompletions,
    }));
    host.skillCommands.clear();
    const skillCommandList = [];
    if (host.settingsManager.getEnableSkillCommands()) {
        for (const skill of host.sessionStore.getSkillsResult().skills) {
            const commandName = `skill:${skill.name}`;
            host.skillCommands.set(commandName, skill.filePath);
            skillCommandList.push({
                name: commandName,
                description: host.prefixAutocompleteDescription(skill.description, skill.sourceInfo),
            });
        }
    }
    return new CombinedAutocompleteProvider([...slashCommands, ...templateCommands, ...extensionCommands, ...skillCommandList], host.sessionStore.getCwd(), host.fdPath);
}

export function setupAutocompleteProvider(host) {
    let provider = host.createBaseAutocompleteProvider();
    for (const wrapProvider of host.autocompleteProviderWrappers) {
        provider = wrapProvider(provider);
    }
    host.autocompleteProvider = provider;
    host.defaultEditor.setAutocompleteProvider(provider);
    if (host.editor !== host.defaultEditor) {
        host.editor.setAutocompleteProvider?.(provider);
    }
}
