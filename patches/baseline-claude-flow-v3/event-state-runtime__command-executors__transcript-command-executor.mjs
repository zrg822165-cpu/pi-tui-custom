export async function executeTranscriptCommand(host, command) {
    switch (command?.type) {
        case "transcript:assistant_stream_remove":
            host.removeStreamingAssistant();
            return true;
        case "transcript:tail_rendering_off":
            host.setTranscriptTailRendering(false);
            return true;
        case "transcript:tail_rendering_on":
            host.setTranscriptTailRendering(true);
            return true;
        case "transcript:add_message":
            host.addMessageToChat(command.args.message);
            return true;
        case "transcript:assistant_stream_start":
            host.startStreamingAssistant(command.args.message);
            return true;
        case "status:response_loader_start":
            host.ensureResponseLoader();
            return true;
        case "transcript:assistant_stream_queue_update":
            host.queueAssistantStreamUpdate(command.args.event);
            return true;
        case "transcript:assistant_stream_flush":
            host.flushStreamingMessageUpdate();
            return true;
        case "transcript:set_streaming_message":
            host.setStreamingAssistantMessage(command.args.message);
            return true;
        case "transcript:set_abort_error_message":
            host.setStreamingAbortError(command.args.errorMessage);
            return true;
        case "transcript:assistant_stream_update_content":
            host.updateStreamingAssistantContent();
            return true;
        case "transcript:assistant_stream_finish":
            host.finishStreamingAssistant();
            return true;
        default:
            return false;
    }
}
