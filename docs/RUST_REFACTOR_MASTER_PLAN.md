# Rust 边界重构总计划

## Summary

总方向：Rust 接管稳定、纯计算、高频、影响模型任务质量的核心；JS 保留扩展能力、UI 组件、插件 renderer、host side effects、pi-agent/session 编排。桥接方式采用 **N-API 原生插件**，CLI/sidecar 只保留为测试、fallback 或进程执行边界。

成功标准：

- 稳态运行不再依赖“每次调用 spawn Rust CLI”。
- 搜索、上下文裁剪、transcript policy、queue/event state、patch diff 等核心逻辑可通过 N-API 批量调用。
- JS 插件、custom renderer、工具定义、事件订阅、session API 不被 Rust 写死。
- 每个迁移模块都有 parity、shadow、fallback 和 smoke 覆盖。

## Key Changes

### 1. Rust Native Bridge

- 新增 `pi-core-native` N-API crate，导出统一批量接口：
  - `version()`
  - `execute(op)`
  - `executeBatch(ops)`
- 新增 JS runtime wrapper：
  - 默认优先 native
  - `PI_RUST_CORE=0` 强制 JS fallback
  - `PI_RUST_BRIDGE=native|cli|js` 用于调试
  - `PI_RUST_SHADOW=1` 保留 Rust/JS 对照
- N-API 只承载纯数据计算；不直接操作 TUI、FS、插件、session、renderer host。

### 2. Search / Model Context Core

- Rust 主接管：
  - rg/fd 参数构造
  - rg JSON 批量解析
  - search result formatting
  - single-line/block context formatting
  - context truncation、预算、去噪、排序、limit notice
- JS 继续负责：
  - `rg`/`fd` 进程启动
  - FS 读取
  - path adapter
  - tool integration
  - extension override
- 必须改成 batch API，禁止 per-line N-API/CLI 调用造成反向性能损耗。

### 3. Transcript / Queue / Event Core

- Rust 主接管：
  - visible transcript budget
  - user text extraction
  - visible text/tool-call detection
  - compaction status
  - assistant stop/error text
  - queue merge/flush/restore plan
  - event action planner
  - lifecycle state snapshot
- JS 继续负责：
  - chat component mutation
  - markdown/skill/custom renderer
  - session calls
  - event bus dispatch
  - extension listeners
- 事件流迁移方式：Rust 返回 serializable action/state plan，JS 执行 side effects。

### 4. UI / Render Performance Core

- Rust 主接管：
  - tool-flow attach decision
  - startup expansion policy
  - thinking/status visibility
  - working loader message
  - frame diff/patch planning
- JS 继续负责：
  - actual TUI component tree
  - themes/colors
  - custom tool/message renderers
  - terminal writer integration
- Patch engine 进入 N-API 前必须锁定 width 语义：Rust 使用与 JS 一致的 visible width 输入或等价算法。

### 5. Shell Execution

- `pi-shell-executor` 保留 sidecar 模式。
- 原因：shell/process execution 是长生命周期、流式 stdout/stderr、abort/process tree 管理，不适合塞进 N-API 同步纯函数模型。
- JS executor factory 默认优先 Rust sidecar，有问题回退 JS executor。

## Implementation Order

1. 创建并提交 `docs/RUST_REFACTOR_MASTER_PLAN.md`，内容使用本计划。
2. 新增 `pi-core-native` N-API crate 和 JS native loader，不迁移业务逻辑，只跑 smoke。
3. 把现有 `runRustCoreValue` 从 CLI spawn 改成 native-first、CLI fallback、JS final fallback。
4. Search core 完整切 native batch：query、rg parse、context、formatting。
5. Transcript/queue/event/ui policy 切 native batch。
6. Patch engine 切 native，先只替换 frame planning/diff，不重写 renderer。
7. 建立 replay/benchmark：搜索大仓库、长 transcript、连续工具流、长回复 streaming。
8. 根据 benchmark 决定是否继续 Rust 化 renderer internals；默认不碰 JS 扩展 renderer。
9. 清理临时 CLI 主路径，只保留 parity/fallback/debug 用途。

## Progress

- [x] 计划文档已创建。
- [x] `pi-core-native` N-API bridge 已创建，支持 `version()`、`execute()`、`executeBatch()`。
- [x] JS runtime bridge 已改为 native-first、CLI fallback，并支持 `PI_RUST_CORE`、`PI_RUST_BRIDGE`、shadow env。
- [x] Search context/query/formatting 已接入 native/batch，JS 保留进程、FS、path adapter 和 tool integration。
- [x] Transcript、queue、event、UI policy 已接入 native-first，JS 保留 renderer、session、event bus 和 side effects。
- [x] Patch engine frame input、frame planner、line diff、ANSI patch buffer 生成已接入 native-first；宽度检测、terminal writer、renderer state commit 继续留在 JS。
- [ ] Replay/benchmark 尚未系统化落地。
- [ ] 根据 benchmark 决定是否将 frame render pipeline 做批量 native plan，默认不碰 JS custom renderer。
- [ ] CLI 主路径清理尚未开始，当前仍保留为 fallback/parity/debug。

## Test Plan

- 每步必须通过：
  - `npm test`
  - `cargo fmt --check`
  - `cargo clippy --all-targets -- -D warnings`
  - `cargo test`
  - `npm run rust:parity`
- 新增 native bridge tests：
  - native available
  - native missing fallback
  - `PI_RUST_CORE=0` fallback
  - native batch result equals JS parity
  - strict shadow mismatch throws
- 新增 benchmark/replay：
  - large search result formatting
  - rg JSON parse 10k+ lines
  - context block formatting
  - long transcript rebuild
  - queue compaction flush
  - render frame diff
- 每个 customized mirror 文件同步到 `patches/baseline-claude-flow-v3/`。

## Assumptions

- Rust edition 继续使用 2024，workspace baseline 保持 Rust `1.95`。
- N-API 是后续主桥接；CLI spawn 不再作为热路径方案。
- JS 扩展能力优先级高于“全 Rust 化”：插件、renderer、session、host side effects 不进入 Rust。
- Rust 接管的边界必须是可序列化输入输出，便于 parity、shadow、回放和回滚。
- 性能优化集中在 Rust 边界闭合后系统 benchmark，而不是每个小模块提前深度调参。
