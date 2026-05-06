import { Spacer, TruncatedText } from "@mariozechner/pi-tui";
import { getAgent, getSession } from "../runtime-host-adapter/index.mjs";
import { runRustCoreValue } from "../rust-core-shadow/runner.mjs";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

function runQueueCore(op, input) {
    return runRustCoreValue({ commandEnv: "PI_QUEUE_CORE_COMMAND", op, input });
}

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
        const input = {
            sessionSteering: session?.getSteeringMessages?.() ?? [],
            sessionFollowUp: session?.getFollowUpMessages?.() ?? [],
            compactionMessages: this.compactionQueuedMessages,
        };
        const rust = runQueueCore("mergeQueues", input);
        if (rust.ok) {
            return rust.value;
        }
        return mergeQueues(input);
    }
    clearAllQueues() {
        const { steering, followUp } = this.getSession()?.clearQueue?.() ?? { steering: [], followUp: [] };
        const input = {
            clearedSteering: steering,
            clearedFollowUp: followUp,
            compactionMessages: this.compactionQueuedMessages,
        };
        const rust = runQueueCore("clearQueues", input);
        const result = rust.ok ? rust.value : clearQueues(input);
        this.compactionQueuedMessages = [];
        return result;
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
        const currentText = options?.currentText ?? this.host.editor.getText();
        const input = { steering, followUp, currentText };
        const rust = runQueueCore("buildRestoreText", input);
        const restore = rust.ok ? rust.value : buildRestoreText(input);
        if (restore.restoredCount === 0) {
            this.updatePendingMessagesDisplay();
            if (options?.abort) {
                this.getAgent()?.abort?.();
            }
            return 0;
        }
        this.host.editor.setText(restore.text);
        this.updatePendingMessagesDisplay();
        if (options?.abort) {
            this.getAgent()?.abort?.();
        }
        return restore.restoredCount;
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
            const input = {
                queuedMessages,
                willRetry: !!options?.willRetry,
                extensionCommandFlags: queuedMessages.map((message) => this.host.isExtensionCommand(message.text)),
            };
            const rust = runQueueCore("planCompactionFlush", input);
            const plan = rust.ok ? rust.value : planCompactionFlush(input);
            let unawaitedPrompt;
            for (const step of plan.steps) {
                const call = step.action === "followUp"
                    ? () => session.followUp(step.text)
                    : step.action === "steer"
                        ? () => session.steer(step.text)
                        : () => session.prompt(step.text);
                if (step.awaitBeforeContinue) {
                    await call();
                }
                else {
                    unawaitedPrompt = call().catch((error) => {
                        restoreQueue(error);
                    });
                }
            }
            this.updatePendingMessagesDisplay();
            void unawaitedPrompt;
        }
        catch (error) {
            restoreQueue(error);
        }
    }
}

function mergeQueues(input) {
    return {
        steering: [
            ...(input.sessionSteering ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "steer").map((msg) => msg.text),
        ],
        followUp: [
            ...(input.sessionFollowUp ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
        ],
    };
}

function clearQueues(input) {
    return {
        steering: [
            ...(input.clearedSteering ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "steer").map((msg) => msg.text),
        ],
        followUp: [
            ...(input.clearedFollowUp ?? []),
            ...(input.compactionMessages ?? []).filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
        ],
    };
}

function buildRestoreText(input) {
    const allQueued = [...(input.steering ?? []), ...(input.followUp ?? [])];
    if (allQueued.length === 0) {
        return { restoredCount: 0, text: input.currentText ?? "" };
    }
    const queuedText = allQueued.join("\n\n");
    const text = [queuedText, input.currentText ?? ""].filter((value) => value.trim()).join("\n\n");
    return { restoredCount: allQueued.length, text };
}

function planCompactionFlush(input) {
    const queuedMessages = input.queuedMessages ?? [];
    const extensionCommandFlags = input.extensionCommandFlags ?? [];
    const isExtension = (index) => !!extensionCommandFlags[index];
    const actionFor = (message, index) => {
        if (isExtension(index))
            return "prompt";
        if (message.mode === "followUp")
            return "followUp";
        return "steer";
    };
    if (input.willRetry) {
        return {
            steps: queuedMessages.map((message, index) => ({
                action: actionFor(message, index),
                text: message.text,
                awaitBeforeContinue: true,
            })),
        };
    }
    const firstPromptIndex = queuedMessages.findIndex((_message, index) => !isExtension(index));
    if (firstPromptIndex === -1) {
        return {
            steps: queuedMessages.map((message) => ({
                action: "prompt",
                text: message.text,
                awaitBeforeContinue: true,
            })),
        };
    }
    return {
        steps: queuedMessages.map((message, index) => ({
            action: index <= firstPromptIndex ? "prompt" : actionFor(message, index),
            text: message.text,
            awaitBeforeContinue: index !== firstPromptIndex,
        })),
    };
}
