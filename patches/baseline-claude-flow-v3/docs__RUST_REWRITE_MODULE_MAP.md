# Rust Rewrite Module Map

This project has been split into replacement boundaries so the current JavaScript
TUI shell can be rewritten piece by piece in Rust without changing user-facing
behavior all at once.

The current `interactive-mode.js` is intentionally a compatibility host shell:
it owns legacy fields and stable method names, while behavior lives in the
modules below.

## Replacement Order

1. `shell-executor/`
   Replace command execution first. It has the cleanest protocol and the least UI
   coupling.

2. `patch-engine/`
   Replace terminal frame diffing and patch writing. Keep the line/frame protocol
   stable before attempting a full renderer rewrite.

3. `tui-renderer/`
   Replace the renderer facade after patching is stable. Preserve event/action
   protocol and visible output semantics.

4. `event-state-runtime/`
   Replace event routing/state machine after renderer and shell boundaries are
   stable. Keep side effects outside reducers.

5. Store modules
   Replace `session-store/`, `transcript-store/`, `queue-store/`,
   `notice-store/`, `bash-store/`, `tool-flow-store/`, and `ui-state-store`
   when their corresponding runtime boundaries are stable.

6. `interactive-mode-support/`
   Replace controller/adapters last. This folder still bridges JS pi-agent APIs,
   TUI components, and compatibility wrapper names.

## Module Boundaries

### `shell-executor/`

Purpose: command execution sidecar boundary.

Important files:

- `interface.mjs`: executor contract.
- `js-shell-executor.mjs`: current JS implementation.
- `sidecar-shell-executor.mjs`: sidecar protocol implementation.
- `process-lines.mjs`: line-oriented process helper.
- `SIDECAR_PROTOCOL.md`: Rust sidecar protocol target.

Rust target: implement command run/execute/abort and stream `start`,
`stdout`, `stderr`, `exit`, `error` events.

### `patch-engine/`

Purpose: terminal frame planning, line diffing, and patch writing.

Important files:

- `interface.mjs`: patch engine contract.
- `line-diff-patch-engine.mjs`: current line diff implementation.
- `frame-planner.mjs`: frame change planning.
- `terminal-patch-writer.mjs`: terminal output writer.
- `frame-runtime.mjs`: frame orchestration.

Rust target: implement the same frame input/output contract before replacing
renderer internals.

### `tui-renderer/`

Purpose: renderer facade and event/action protocol for the custom TUI shell.

Important files:

- `interface.mjs`: renderer contract.
- `renderer-host-contract.mjs`: renderer host expectations.
- `pi-interactive-renderer.mjs`: current renderer facade.
- `pi-agent-event-adapter.mjs`: agent event to renderer event conversion.
- `RENDERER_PROTOCOL.md`: protocol notes.

Rust target: consume the same event shapes and emit equivalent layout/status/chat
updates. Do not change visible TUI semantics during the first port.

### `event-state-runtime/`

Purpose: ordered event dispatch, event bus, state machine, effect commands, and
host side-effect boundary.

Important files:

- `event-state-runtime.mjs`: source subscription and dispatch facade.
- `state-machine.mjs`: pure lifecycle state.
- `event-action-planner.mjs`: serializable intent planning.
- `interactive-host-contract.mjs`: host method contract.
- `interactive-host-effects.mjs`: host side-effect router.
- `effect-command.mjs`: command protocol.
- `runtime-self-test.mjs`: coverage/parity test.

Rust target: keep reducers pure and side effects command-based. Preserve event
ordering: state apply, bus emit, host listener.

### Store Modules

Purpose: isolate mutable host state and display-specific store operations.

Modules:

- `session-store/`: pi agent session facade and settings/session bridge.
- `transcript-store/`: chat transcript rendering, streaming component ownership.
- `queue-store/`: queued user/compaction messages.
- `notice-store/`: warning/update notices.
- `bash-store/`: bash command UI ownership.
- `tool-flow-store/`: Claude-style tool flow summary and tool component state.
- `ui-state-store/`: working/thinking/status loader state.

Rust target: preserve public factory names (`createXStore`) and methods consumed
by `host-facade-adapter.mjs`.

### `interactive-mode-support/`

Purpose: compatibility controllers and adapters extracted from
`interactive-mode.js`.

Important groups:

- Bootstrap/lifecycle:
  - `interactive-bootstrap-adapter.mjs`
  - `lifecycle-runtime-adapter.mjs`
  - `process-lifecycle-adapter.mjs`
  - `interactive-wrapper-registry.mjs`
- Input and command controllers:
  - `input-controller-adapter.mjs`
  - `command-controller-adapter.mjs`
  - `queue-interaction-adapter.mjs`
  - `external-editor-adapter.mjs`
- Rendering helpers:
  - `path-formatters.mjs`
  - `resource-source-formatters.mjs`
  - `extension-ui-adapter.mjs`
  - `extension-widgets-adapter.mjs`
  - `custom-editor-adapter.mjs`
- Stream/status:
  - `stream-runtime-adapter.mjs`
  - `stream-smoothing-policy.mjs`
  - `stream-diagnostics.mjs`
  - `mode-state-controller-adapter.mjs`
- Host facade:
  - `host-facade-adapter.mjs`

Rust target: do not port this folder as one blob. Port the stable lower-level
modules first, then shrink these adapters until they only bind Rust modules to
the legacy `InteractiveMode` API.

## Compatibility Shell

Current host shell:

- `node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js`

Current role:

- Legacy fields and accessors.
- Compatibility method names expected by upstream pi-agent.
- `installInteractiveModeWrappers(InteractiveMode)` installs wrapper methods
  from `interactive-mode-support/interactive-wrapper-registry.mjs`.

Rust target:

- Keep this file as a thin JS shim during migration.
- Replace module implementations behind the shim.
- Only remove the shim once Rust owns renderer, event runtime, stores, and
  command execution.

## Baseline Sync

Every customized file that mirrors `node_modules` behavior should be copied to:

- `patches/baseline-claude-flow-v3/`

Use hash checks after edits. The expected clean result is:

```text
hash_mismatches=0
```

## Verification

Minimum checks after structural changes:

```powershell
node --check node_modules\@mariozechner\pi-coding-agent\dist\modes\interactive\interactive-mode.js
node --check interactive-mode-support\interactive-wrapper-registry.mjs
```

Smoke test:

```powershell
@'
import { InteractiveMode } from './node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js';
import { checkEffectCommandExecutor, runEventStateRuntimeSelfTest } from './event-state-runtime/index.mjs';
const proto = InteractiveMode.prototype;
console.log(JSON.stringify({
  interactiveImport: true,
  hasHandleEvent: typeof proto.handleEvent,
  hasShutdown: typeof proto.shutdown,
  hasBash: typeof proto.handleBashCommand,
  self: runEventStateRuntimeSelfTest().ok,
  executor: (await checkEffectCommandExecutor()).ok
}, null, 2));
'@ | node --input-type=module
```

