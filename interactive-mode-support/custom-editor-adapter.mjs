import { getEditorTheme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export function setCustomEditorComponent(host, factory, deps = {}) {
    host.editorComponentFactory = factory;
    const currentText = host.editor.getText();
    if (factory) {
        const editorTheme = deps.getEditorTheme ? deps.getEditorTheme() : getEditorTheme();
        const newEditor = factory(host.ui, editorTheme, host.keybindings);
        newEditor.onSubmit = host.defaultEditor.onSubmit;
        newEditor.onChange = host.defaultEditor.onChange;
        newEditor.setText(currentText);
        if (newEditor.borderColor !== undefined) {
            newEditor.borderColor = host.defaultEditor.borderColor;
        }
        if (newEditor.setPaddingX !== undefined) {
            newEditor.setPaddingX(host.defaultEditor.getPaddingX());
        }
        if (newEditor.setAutocompleteProvider && host.autocompleteProvider) {
            newEditor.setAutocompleteProvider(host.autocompleteProvider);
        }
        const customEditor = newEditor;
        if ("actionHandlers" in customEditor && customEditor.actionHandlers instanceof Map) {
            if (!customEditor.onEscape) {
                customEditor.onEscape = () => host.defaultEditor.onEscape?.();
            }
            if (!customEditor.onCtrlD) {
                customEditor.onCtrlD = () => host.defaultEditor.onCtrlD?.();
            }
            if (!customEditor.onPasteImage) {
                customEditor.onPasteImage = () => host.defaultEditor.onPasteImage?.();
            }
            if (!customEditor.onExtensionShortcut) {
                customEditor.onExtensionShortcut = (data) => host.defaultEditor.onExtensionShortcut?.(data);
            }
            for (const [action, handler] of host.defaultEditor.actionHandlers) {
                customEditor.actionHandlers.set(action, handler);
            }
        }
        host.editor = newEditor;
    }
    else {
        host.defaultEditor.setText(currentText);
        host.editor = host.defaultEditor;
    }
    host.rendererHost.setEditorComponent(host.editor);
    host.ui.requestRender();
}
