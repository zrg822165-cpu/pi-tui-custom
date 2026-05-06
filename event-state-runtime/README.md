# Event State Runtime

Owns agent event dispatch boundaries behind a replaceable interface.

- event bus subscription and wildcard listeners
- source subscription lifecycle
- UI event adaptation boundary
- runtime dispatch facade
- pure event classification and lifecycle state-machine snapshots
- serializable event action plans for future host-side replay
- interactive host side-effect dispatcher for stable event groups
- explicit host effect contract for JavaScript and future Rust adapters
- runtime coverage self-test for handled/planned/known event types
- normalized effect result objects for diagnostics and Rust parity
- effect command records and a JS executor for command-first side effects
- domain command executors split by core/tool/transcript/compaction/retry

Current ownership boundary:

- `InteractiveMode` now acts as the JavaScript host adapter for concrete UI
  side effects, preserving current rendering behavior while exposing narrow
  runtime host methods.
- `EventStateRuntime` owns source subscription, dispatch ordering, event bus
  hooks, and UI-event adaptation.
- `EventStateMachine` owns pure agent/message/tool/stream lifecycle state and
  exposes `getSnapshot()` / `getLastTransition()` for diagnostics and future
  Rust parity.
- `planEventActions()` describes side-effect intent for diagnostics and future
  replay.
- `handleInteractiveHostEvent()` dispatches stable event side effects behind a
  host-method boundary. It imports no TUI classes and can be replaced by a Rust
  host adapter later.
- `validateInteractiveHost()` / `assertInteractiveHost()` describe the host
  methods and objects required by the side-effect layer. They are intended for
  smoke tests, diagnostics, and Rust parity checks, not per-event hot paths.
- `runEventStateRuntimeSelfTest()` checks event coverage and optionally validates
  a host implementation against the interactive host contract.
- `handleInteractiveHostEvent()` stores the latest normalized effect result on
  `host.lastInteractiveHostEffectResult`. This is diagnostic state only; visible
  behavior still comes from the existing host side effects.
- `EffectResult.commands` records the side-effect protocol for diagnostics and
  Rust parity. Stable event domains now execute through `executeEffectCommands()`
  instead of mutating the host directly inside the router.
- `command-executors/` maps command records onto narrow host adapter methods by
  domain. The public command protocol remains in `effect-command.mjs`, so a Rust
  implementation can replace executors without changing event handlers.

Rust rewrite notes:

- Keep event intake as append-only ordered transitions.
- Keep UI side effects outside reducers; reducers should return serializable
  actions and snapshots.
- Preserve event ordering: state-machine apply, event bus emit, host listener.
- Implement the `INTERACTIVE_HOST_REQUIRED_PATHS` contract first, then port the
  command executor by domain: core/message/tool/compaction/retry/status.
