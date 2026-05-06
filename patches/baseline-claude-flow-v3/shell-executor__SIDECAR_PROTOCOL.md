# Shell Executor Sidecar Protocol

Set `PI_SHELL_EXECUTOR_COMMAND` to a sidecar executable command to replace the
JavaScript shell/process executor.

Transport is JSON Lines over stdio.

## Request: run

```json
{"type":"run","id":"abc","mode":"shell","command":"echo hi","cwd":"C:/repo","env":{},"timeout":1000}
```

`mode` is either:

- `shell`: execute `command` through the sidecar's shell policy.
- `process`: execute `command` directly with `args`.

Process mode example:

```json
{"type":"run","id":"abc","mode":"process","command":"node","args":["-e","console.log(1)"],"cwd":"C:/repo"}
```

## Request: abort

```json
{"type":"abort","id":"abc"}
```

## Responses

Chunks are base64 encoded bytes.

```json
{"type":"start","id":"abc","command":"echo hi","cwd":"C:/repo"}
{"type":"stdout","id":"abc","chunk":"aGkK"}
{"type":"stderr","id":"abc","chunk":"ZXJyCg=="}
{"type":"exit","id":"abc","exitCode":0,"timedOut":false,"aborted":false,"killed":false}
{"type":"error","id":"abc","message":"spawn failed"}
```

