export const EVENT_STATE_RUNTIME_PROTOCOL_VERSION = 1;

export const EVENT_STATE_RUNTIME_SURFACE = Object.freeze({
    eventBus: [
        "subscribe",
        "unsubscribe",
        "emit",
        "clear",
    ],
    runtime: [
        "subscribeToSource",
        "dispatch",
        "getSnapshot",
        "getLastTransition",
        "dispose",
    ],
    adapters: [
        "toUiEvent",
    ],
    stateMachine: [
        "apply",
        "snapshot",
        "reset",
    ],
    planners: [
        "planEventActions",
        "getPlanRenderReason",
    ],
    hostEffects: [
        "handleInteractiveHostEvent",
        "validateInteractiveHost",
        "assertInteractiveHost",
        "getEffectHandler",
        "isHandledEventType",
        "normalizeEffectResult",
        "createEffectCommand",
        "executeEffectCommands",
    ],
    diagnostics: [
        "checkEventRuntimeCoverage",
        "checkEffectCommandShape",
        "checkEffectCommandExecutor",
        "runEventStateRuntimeSelfTest",
    ],
});
