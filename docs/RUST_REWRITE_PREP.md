# Rust Rewrite Prep

This note captures the current Rust migration choices for this repo so future
work can continue after context compaction.

## Toolchain Baseline

- Rust toolchain: stable `1.95.0`.
- Default host/target: `x86_64-pc-windows-msvc`.
- Components available: `rustfmt`, `clippy`, `rust-analyzer`.
- A local `cargo build` smoke test passed, so the MSVC linker path is usable.

## Project Defaults

- Use Rust 2024 for new crates unless a dependency forces otherwise.
- Set `rust-version = "1.95"` in new crates.
- Use workspace `resolver = "3"` with Rust 2024 crates.
- Keep JS compatibility shims during migration. Rust should replace one stable
  boundary at a time.

## First Rust Target

Start with `shell-executor` as a JSONL stdio sidecar.

Protocol reference:

- `shell-executor/SIDECAR_PROTOCOL.md`
- `shell-executor/interface.mjs`

Required behavior:

- Accept `run` and `abort` requests.
- Support `shell` and `process` modes.
- Emit `start`, `stdout`, `stderr`, `exit`, and `error` responses.
- Base64 encode raw output chunks.
- Preserve Windows cwd/env behavior expected by the current JS executor.

## Recommended Crates

- `tokio`: async process, stdin/stdout, task orchestration, timers, select.
- `serde` and `serde_json`: request/response structs and JSONL encoding.
- `base64`: chunk encoding.
- `tracing` and `tracing-subscriber`: diagnostics to stderr only.
- `anyhow` or `thiserror`: error boundaries. Prefer typed errors where they
  cross module boundaries.
- `uuid`: generated execution ids if the Rust side ever needs them.

## Implementation Rules

- Treat stdout as protocol output only. Diagnostics go to stderr.
- Parse stdin line-by-line as JSONL.
- Never allow malformed input to crash the sidecar; emit an `error` response
  when an id is available, otherwise log to stderr.
- Store running children by id so `abort` can target one execution.
- Prefer small serializable structs over ad hoc `serde_json::Value`.
- Avoid global mutable state except the execution registry guarded by async
  synchronization.
- Keep sidecar commands long-running; do not spawn one Rust process per command
  unless explicitly testing.

## Patch Engine Rust Core

`pi-patch-engine` ports the pure line diff and ANSI patch construction logic to
Rust with a CLI parity harness. Do not route every render frame through the CLI:
per-frame process startup or JSON IPC would likely erase the Rust speedup.

Current safe use:

- Rust library crate for pure diff/patch logic.
- Rust frame planner and frame input derivation for pure render-path decisions.
- CLI only for parity checks and future integration experiments.
- JS remains the default renderer path until a low-overhead bridge is selected.

Current deliberate gap:

- Frame state commits still depend on JS `visibleWidth()` terminal-width
  semantics. When porting that boundary, pass precomputed line widths into Rust
  or port the exact width algorithm rather than using byte length or Unicode
  scalar count.

Recommended bridge options:

- N-API/native addon for hot per-frame calls.
- A long-running sidecar only if batching whole frame plans amortizes JSON IPC.
- WASM only if startup/call overhead benchmarks well inside Node.

## Verification

For Rust crates:

```powershell
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

For the JS compatibility project:

```powershell
npm test
```

For sidecar integration, run the JS smoke test with:

```powershell
$env:PI_SHELL_EXECUTOR_COMMAND = "<path-to-sidecar-exe>"
npm test
```

For patch engine parity:

```powershell
$env:PI_PATCH_ENGINE_COMMAND = "<path-to-pi-patch-engine-exe>"
node scripts/check-rust-patch-engine-parity.mjs
```

## Search Core Rust Migration

`pi-search-core` ports stable search helper logic that affects model task
quality:

- ripgrep/fd argument construction.
- output truncation metadata compatible with existing tool output policy.
- grep line truncation.
- human-readable size labels.

This boundary matters for model capability because search results and truncation
notices shape what context the model sees next. Keep the JS tool integration in
place while moving deterministic formatting and query planning into Rust.

Verification:

```powershell
$env:PI_SEARCH_CORE_COMMAND = "<path-to-pi-search-core-exe>"
node scripts/check-rust-search-core-parity.mjs
```

## Queue Core Rust Migration

`pi-queue-core` ports deterministic queue decisions that affect long-running
model task continuity:

- merging session queues with compaction queues;
- restoring queued text back into the editor;
- planning post-compaction flush order and whether each session call should be
  awaited before continuing.

JS still owns UI rendering, extension-command detection, session calls, and
error recovery. Rust owns only the pure plan so compaction follow-up behavior
stays testable and stable.

Verification:

```powershell
$env:PI_QUEUE_CORE_COMMAND = "<path-to-pi-queue-core-exe>"
node scripts/check-rust-queue-core-parity.mjs
```

## Event Core Rust Migration

`pi-event-core` ports the serializable event action planner. This improves the
reliability of model execution feedback because agent/message/tool events map to
stable side-effect intent before JS performs UI and extension work.

Current boundary:

- Rust owns event classification and action-plan construction.
- JS still owns event intake ordering, event bus listeners, host side effects,
  and extension integration.
- Do not move concrete UI mutations into Rust; keep the action plan serializable
  and host-neutral.
- Rust also includes a parity-tested lifecycle state-machine core for ordered
  agent/message/tool/stream phase snapshots. JS still owns source subscription
  and event bus dispatch ordering.

Verification:

```powershell
$env:PI_EVENT_CORE_COMMAND = "<path-to-pi-event-core-exe>"
node scripts/check-rust-event-core-parity.mjs
```

## Notes From Current Rust Research

- Rust 1.95.0 is the current local stable and should be used as the migration
  baseline.
- Rust 2024 dependency resolver behavior is the right default for new workspace
  crates.
- `cfg_select!` is available on stable and can help keep Windows/Unix process
  differences readable, but avoid clever cfg use unless it simplifies code.
- `if let` match guards are available and useful for concise protocol routing.
- Prefer standard library and Tokio primitives before introducing extra
  concurrency crates.
