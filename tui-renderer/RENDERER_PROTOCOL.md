# TUI Renderer Protocol

The current renderer is still the JavaScript `InteractiveMode`, but it now emits
standard renderer events through `tui-renderer`.

Future renderers should implement:

```js
renderer.bind(actions)
renderer.start()
renderer.dispatch(event)
renderer.stop()
renderer.getSnapshot()
```

`host.mjs` owns the current JavaScript renderer host:

- creates `TUI(new ProcessTerminal())`
- creates the main layout containers
- enables append-only transcript cache on the chat container
- attaches header/chat/status/widgets/editor/footer in renderer-defined order
- owns header, editor, and footer slot replacement through host APIs

Actions are host callbacks such as `submitInput`, `abort`, `newSession`, and
`resumeSession`.

Core event types live in `events.mjs`:

- `session_loaded`
- `session_switched`
- `message_start`
- `message_delta`
- `message_end`
- `tool_start`
- `tool_delta`
- `tool_end`
- `status_update`
- `input_submit`
- `error`

`view-state.mjs` contains the renderer-side reducer for event-derived state.
`components/index.mjs` is the renderer-owned component entrypoint. It currently
exports the pi-tui JavaScript components, so `InteractiveMode` no longer imports
the customized message/status/tool components directly from pi internals.

Component ownership is staged:

- Renderer-owned local implementations:
  - `assistant-message.mjs`
  - `user-message.mjs`
  - `thinking-status.mjs`
  - `tool-flow-summary.mjs`
  - `tool-execution.mjs`
  - `custom-editor.mjs`
  - `footer.mjs`
- Legacy pass-through exports remain for selectors/dialogs and minor widgets.
  These still come from pi internals, but `InteractiveMode` imports them through
  the renderer entrypoint so they can be migrated one at a time.
