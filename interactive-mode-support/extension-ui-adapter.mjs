import { Text } from "@mariozechner/pi-tui";
import { ExtensionEditorComponent, ExtensionInputComponent, ExtensionSelectorComponent } from "../tui-renderer/index.mjs";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { formatMissingSessionCwdPrompt } from "../node_modules/@mariozechner/pi-coding-agent/dist/core/session-cwd.js";

export function addExtensionTerminalInputListener(host, handler) {
    const unsubscribe = host.ui.addInputListener(handler);
    host.extensionTerminalInputUnsubscribers.add(unsubscribe);
    return () => {
        unsubscribe();
        host.extensionTerminalInputUnsubscribers.delete(unsubscribe);
    };
}

export function clearExtensionTerminalInputListeners(host) {
    for (const unsubscribe of host.extensionTerminalInputUnsubscribers) {
        unsubscribe();
    }
    host.extensionTerminalInputUnsubscribers.clear();
}

export async function promptForMissingSessionCwd(host, error) {
    const confirmed = await host.showExtensionConfirm("Session cwd not found", formatMissingSessionCwdPrompt(error.issue));
    return confirmed ? error.issue.fallbackCwd : undefined;
}

export function showExtensionSelector(host, title, options, opts, deps = {}) {
    const SelectorComponent = deps.ExtensionSelectorComponent ?? ExtensionSelectorComponent;
    return new Promise((resolve) => {
        if (opts?.signal?.aborted) {
            resolve(undefined);
            return;
        }
        const onAbort = () => {
            hideExtensionSelector(host);
            resolve(undefined);
        };
        opts?.signal?.addEventListener("abort", onAbort, { once: true });
        host.extensionSelector = new SelectorComponent(title, options, (option) => {
            opts?.signal?.removeEventListener("abort", onAbort);
            hideExtensionSelector(host);
            resolve(option);
        }, () => {
            opts?.signal?.removeEventListener("abort", onAbort);
            hideExtensionSelector(host);
            resolve(undefined);
        }, { tui: host.ui, timeout: opts?.timeout });
        host.rendererHost.setEditorComponent(host.extensionSelector);
        host.ui.requestRender();
    });
}

export function hideExtensionSelector(host) {
    host.extensionSelector?.dispose();
    host.rendererHost.setEditorComponent(host.editor);
    host.extensionSelector = undefined;
    host.ui.requestRender();
}

export function showExtensionInput(host, title, placeholder, opts, deps = {}) {
    const InputComponent = deps.ExtensionInputComponent ?? ExtensionInputComponent;
    return new Promise((resolve) => {
        if (opts?.signal?.aborted) {
            resolve(undefined);
            return;
        }
        const onAbort = () => {
            hideExtensionInput(host);
            resolve(undefined);
        };
        opts?.signal?.addEventListener("abort", onAbort, { once: true });
        host.extensionInput = new InputComponent(title, placeholder, (value) => {
            opts?.signal?.removeEventListener("abort", onAbort);
            hideExtensionInput(host);
            resolve(value);
        }, () => {
            opts?.signal?.removeEventListener("abort", onAbort);
            hideExtensionInput(host);
            resolve(undefined);
        }, { tui: host.ui, timeout: opts?.timeout });
        host.rendererHost.setEditorComponent(host.extensionInput);
        host.ui.requestRender();
    });
}

export function hideExtensionInput(host) {
    host.extensionInput?.dispose();
    host.rendererHost.setEditorComponent(host.editor);
    host.extensionInput = undefined;
    host.ui.requestRender();
}

export function showExtensionEditor(host, title, prefill, deps = {}) {
    const EditorComponent = deps.ExtensionEditorComponent ?? ExtensionEditorComponent;
    return new Promise((resolve) => {
        host.extensionEditor = new EditorComponent(host.ui, host.keybindings, title, prefill, (value) => {
            hideExtensionEditor(host);
            resolve(value);
        }, () => {
            hideExtensionEditor(host);
            resolve(undefined);
        });
        host.rendererHost.setEditorComponent(host.extensionEditor);
        host.ui.requestRender();
    });
}

export function hideExtensionEditor(host) {
    host.rendererHost.setEditorComponent(host.editor);
    host.extensionEditor = undefined;
    host.ui.requestRender();
}

export function showExtensionNotify(host, message, type) {
    if (type === "error") {
        host.showError(message);
    }
    else if (type === "warning") {
        host.showWarning(message);
    }
    else {
        host.showStatus(message);
    }
}

export async function showExtensionCustom(host, factory, options, deps = {}) {
    const customTheme = deps.theme ?? theme;
    const savedText = host.editor.getText();
    const isOverlay = options?.overlay ?? false;
    const restoreEditor = () => {
        host.rendererHost.setEditorComponent(host.editor);
        host.editor.setText(savedText);
        host.ui.requestRender();
    };
    return new Promise((resolve, reject) => {
        let component;
        let closed = false;
        const close = (result) => {
            if (closed) {
                return;
            }
            closed = true;
            if (isOverlay) {
                host.ui.hideOverlay();
            }
            else {
                restoreEditor();
            }
            resolve(result);
            try {
                component?.dispose?.();
            }
            catch {
                // Ignore extension component disposal errors.
            }
        };
        Promise.resolve(factory(host.ui, customTheme, host.keybindings, close))
            .then((createdComponent) => {
            if (closed) {
                return;
            }
            component = createdComponent;
            if (isOverlay) {
                const resolveOptions = () => {
                    if (options?.overlayOptions) {
                        return typeof options.overlayOptions === "function"
                            ? options.overlayOptions()
                            : options.overlayOptions;
                    }
                    const width = component.width;
                    return width ? { width } : undefined;
                };
                const handle = host.ui.showOverlay(component, resolveOptions());
                options?.onHandle?.(handle);
            }
            else {
                host.rendererHost.setEditorComponent(component);
                host.ui.requestRender();
            }
        })
            .catch((err) => {
            if (closed) {
                return;
            }
            if (!isOverlay) {
                restoreEditor();
            }
            reject(err);
        });
    });
}

export function showExtensionError(host, extensionPath, error, stack) {
    const errorMsg = `Extension "${extensionPath}" error: ${error}`;
    const errorText = new Text(theme.fg("error", errorMsg), 1, 0);
    host.rendererHost.appendChat(errorText);
    if (stack) {
        const stackLines = stack
            .split("\n")
            .slice(1)
            .map((line) => theme.fg("dim", `  ${line.trim()}`))
            .join("\n");
        if (stackLines) {
            host.rendererHost.appendChat(new Text(stackLines, 1, 0));
        }
    }
    host.ui.requestRender();
}
