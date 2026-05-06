import { Spacer, TruncatedText } from "@mariozechner/pi-tui";
import { getAgent, getSession } from "../runtime-host-adapter/index.mjs";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export class QueueStore {
    host;
    compactionQueuedMessages = [];
    constructor(host) {
        this.host = host;
    }
    getSession() {
        return getSession(this.host);
    }
    getAgent() {
        return getAgent(this.host);
    }
    getAllQueuedMessages() {
        const session = this.getSession();
        return {
            steering: [
                ...(session?.getSteeringMessages?.() ?? []),
                ...this.compactionQueuedMessages.filter((msg) => msg.mode === "steer").map((msg) => msg.text),
            ],
            followUp: [
                ...(session?.getFollowUpMessages?.() ?? []),
                ...this.compactionQueuedMessages.filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
            ],
        };
    }
    clearAllQueues() {
        const { steering, followUp } = this.getSession()?.clearQueue?.() ?? { steering: [], followUp: [] };
        const compactionSteering = this.compactionQueuedMessages.filter((msg) => msg.mode === "steer").map((msg) => msg.text);
        const compactionFollowUp = this.compactionQueuedMessages.filter((msg) => msg.mode === "followUp").map((msg) => msg.text);
        this.compactionQueuedMessages = [];
        return {
            steering: [...steering, ...compactionSteering],
            followUp: [...followUp, ...compactionFollowUp],
        };
    }
    updatePendingMessagesDisplay() {
        this.host.rendererHost.clearPending();
        const { steering: steeringMessages, followUp: followUpMessages } = this.getAllQueuedMessages();
        if (steeringMessages.length > 0 || followUpMessages.length > 0) {
            this.host.rendererHost.appendPending(new Spacer(1));
            for (const message of steeringMessages) {
                const text = theme.fg("dim", `Steering: ${message}`);
                this.host.rendererHost.appendPending(new TruncatedText(text, 1, 0));
            }
            for (const message of followUpMessages) {
                const text = theme.fg("dim", `Follow-up: ${message}`);
                this.host.rendererHost.appendPending(new TruncatedText(text, 1, 0));
            }
            const dequeueHint = this.host.getAppKeyDisplay("app.message.dequeue");
            const hintText = theme.fg("dim", `↳ ${dequeueHint} to edit all queued messages`);
            this.host.rendererHost.appendPending(new TruncatedText(hintText, 1, 0));
        }
    }
    restoreQueuedMessagesToEditor(options) {
        const { steering, followUp } = this.clearAllQueues();
        const allQueued = [...steering, ...followUp];
        if (allQueued.length === 0) {
            this.updatePendingMessagesDisplay();
            if (options?.abort) {
                this.getAgent()?.abort?.();
            }
            return 0;
        }
        const queuedText = allQueued.join("\n\n");
        const currentText = options?.currentText ?? this.host.editor.getText();
        const combinedText = [queuedText, currentText].filter((t) => t.trim()).join("\n\n");
        this.host.editor.setText(combinedText);
        this.updatePendingMessagesDisplay();
        if (options?.abort) {
            this.getAgent()?.abort?.();
        }
        return allQueued.length;
    }
    queueCompactionMessage(text, mode) {
        this.compactionQueuedMessages.push({ text, mode });
        this.host.editor.addToHistory?.(text);
        this.host.editor.setText("");
        this.updatePendingMessagesDisplay();
        this.host.showStatus("Queued message for after compaction");
    }
    async flushCompactionQueue(options) {
        if (this.compactionQueuedMessages.length === 0) {
            return;
        }
        const queuedMessages = [...this.compactionQueuedMessages];
        this.compactionQueuedMessages = [];
        this.updatePendingMessagesDisplay();
        const restoreQueue = (error) => {
            this.getSession()?.clearQueue?.();
            this.compactionQueuedMessages = queuedMessages;
            this.updatePendingMessagesDisplay();
            this.host.showError(`Failed to send queued message${queuedMessages.length > 1 ? "s" : ""}: ${error instanceof Error ? error.message : String(error)}`);
        };
        try {
            const session = this.getSession();
            if (options?.willRetry) {
                for (const message of queuedMessages) {
                    if (this.host.isExtensionCommand(message.text)) {
                        await session.prompt(message.text);
                    }
                    else if (message.mode === "followUp") {
                        await session.followUp(message.text);
                    }
                    else {
                        await session.steer(message.text);
                    }
                }
                this.updatePendingMessagesDisplay();
                return;
            }
            const firstPromptIndex = queuedMessages.findIndex((message) => !this.host.isExtensionCommand(message.text));
            if (firstPromptIndex === -1) {
                for (const message of queuedMessages) {
                    await session.prompt(message.text);
                }
                return;
            }
            const preCommands = queuedMessages.slice(0, firstPromptIndex);
            const firstPrompt = queuedMessages[firstPromptIndex];
            const rest = queuedMessages.slice(firstPromptIndex + 1);
            for (const message of preCommands) {
                await session.prompt(message.text);
            }
            const promptPromise = session.prompt(firstPrompt.text).catch((error) => {
                restoreQueue(error);
            });
            for (const message of rest) {
                if (this.host.isExtensionCommand(message.text)) {
                    await session.prompt(message.text);
                }
                else if (message.mode === "followUp") {
                    await session.followUp(message.text);
                }
                else {
                    await session.steer(message.text);
                }
            }
            this.updatePendingMessagesDisplay();
            void promptPromise;
        }
        catch (error) {
            restoreQueue(error);
        }
    }
}
