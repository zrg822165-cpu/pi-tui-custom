export const TUI_RENDERER_PROTOCOL_VERSION = 1;

export const TuiEventType = Object.freeze({
    SESSION_LOADED: "session_loaded",
    SESSION_SWITCHED: "session_switched",
    MESSAGE_START: "message_start",
    MESSAGE_DELTA: "message_delta",
    MESSAGE_END: "message_end",
    TOOL_START: "tool_start",
    TOOL_DELTA: "tool_delta",
    TOOL_END: "tool_end",
    STATUS_UPDATE: "status_update",
    INPUT_SUBMIT: "input_submit",
    ERROR: "error",
});

export const TuiActionType = Object.freeze({
    SUBMIT_INPUT: "submit_input",
    ABORT: "abort",
    NEW_SESSION: "new_session",
    RESUME_SESSION: "resume_session",
    FORK_SESSION: "fork_session",
    EXPAND_TOOLS: "expand_tools",
});

