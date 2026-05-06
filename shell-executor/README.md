# Shell Executor

This folder is the replacement boundary for command execution.

The JavaScript implementation is intentionally small and protocol-shaped so a
future Rust executor can implement the same event stream without touching the
agent or TUI code.

Contract:

- `run(command, options)` returns an async iterable of shell events.
- `execute(command, options)` consumes that stream and returns a final result.
- `abort(id)` cancels a running command.
- `runProcessLines(command, args, options)` is the process-mode helper for tools
  that need line-oriented stdout without directly importing `child_process`.

Event flow:

```text
start -> stdout/stderr* -> exit
start -> stdout/stderr* -> error
```
