export async function handleFollowUp(host) {
    const text = (host.editor.getExpandedText?.() ?? host.editor.getText()).trim();
    if (!text)
        return;
    if (host.sessionStore.isCompactionActive()) {
        if (host.isExtensionCommand(text)) {
            host.editor.addToHistory?.(text);
            host.editor.setText("");
            await host.sessionStore.prompt(text);
        }
        else {
            host.queueCompactionMessage(text, "followUp");
        }
        return;
    }
    if (host.sessionStore.isStreamingActive()) {
        host.editor.addToHistory?.(text);
        host.editor.setText("");
        await host.sessionStore.prompt(text, { streamingBehavior: "followUp" });
        host.updatePendingMessagesDisplay();
        host.ui.requestRender();
    }
    else if (host.editor.onSubmit) {
        host.editor.setText("");
        host.editor.onSubmit(text);
    }
}

export function handleDequeue(host) {
    const restored = host.restoreQueuedMessagesToEditor();
    if (restored === 0) {
        host.showStatus("No queued messages to restore");
    }
    else {
        host.showStatus(`Restored ${restored} queued message${restored > 1 ? "s" : ""} to editor`);
    }
}
