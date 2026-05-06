# Patch Engine

Owns terminal patch planning behind a replaceable interface.

- line-level changed range detection
- append-fast and tail-window diff decisions
- live/status line patch buffer construction
- full render, viewport patch, deletion patch, and normal diff patch buffers
- visible-width safety checks and crash/debug report formatting
- hardware cursor movement buffer construction
- terminal write adapter for timing and future sidecar/native bridges
- frame state commit calculations after full/viewport/delete/diff render paths
- hardware cursor state commits
- frame path planning before and after line diff
- frame input preparation for terminal size and viewport-derived values
- frame runtime facade that groups planner, writer, and state application
- frame path executors for full render, no-change, delete-lines, viewport patch, diff render, and hardware cursor positioning
- diagnostic metadata for render timing

This module is intentionally UI-agnostic. The current JavaScript implementation is
used by `pi-tui`, and can later be replaced by a Rust sidecar/native renderer
without changing agent or transcript semantics.

Current ownership boundary:

- `TUI` still owns component rendering, overlay composition, cursor extraction,
  visible-width safety checks, terminal writes, and IME cursor placement.
- `PatchEngine` owns changed-range planning and ANSI buffer construction for
  the renderer's write paths.
- `TerminalPatchWriter` owns the terminal write call and write timing. A Rust
  renderer can replace this with a native/sidecar bridge later.
- `FrameStateAdapter` owns pure next-frame state calculations. `TUI` applies
  those updates and keeps focus/input/component lifecycle ownership.
- `FramePlanner` owns pure render-path selection. `TUI` still executes the
  selected path because it owns lifecycle side effects and fallback behavior.
- `FrameInputAdapter` owns pure frame input derivation from terminal and prior
  renderer state.
- `FrameRuntime` is the facade intended as the future renderer backend entry
  point. It currently delegates to the JS planner/engine/writer/state modules.
