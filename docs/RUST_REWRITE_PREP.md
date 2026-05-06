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
