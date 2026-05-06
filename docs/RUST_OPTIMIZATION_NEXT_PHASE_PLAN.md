# 下一阶段激进优化计划文件

## Summary

总方向：第一阶段 Rust 边界重构已经完成；下一阶段不再继续“为了 Rust 而 Rust”，而是进入**真实 replay 驱动的激进性能优化**。目标是把用户体感和模型执行能力继续往前推，重点攻击真实场景中的等待、卡顿、上下文损耗、工具链吞吐和 TUI streaming 延迟。

成功标准：

- 有真实 replay/benchmark 基线，不再只依赖 synthetic bench。
- 用户体感路径：搜索、长输出 streaming、工具连续执行、长 transcript、TUI render 有明确 p50/p95 指标。
- 模型执行路径：上下文裁剪质量、工具结果格式、队列/事件吞吐、shell 执行反馈更稳定。
- 保留 JS 扩展能力；Rust 继续只接管高频、稳定、可序列化、可回放核心。
- 所有激进优化必须有 fallback、parity 或 replay 对照。

## Key Changes

### 1. Replay / Benchmark 升级为主决策系统

- 新增系统级 replay：
  - 大仓库搜索 replay
  - 10k+ rg JSON stdout replay
  - 100k+ 行 context formatting replay
  - 长 transcript rebuild replay
  - 连续工具流 replay
  - 长回复 streaming render replay
  - shell stdout/stderr streaming replay
- benchmark 输出固定 JSON schema，至少包含：
  - scenario
  - bridge mode
  - input size
  - p50/p95/max
  - bytes/lines/events processed
  - fallback count
- CI/本地都能跑轻量版本；重型版本用显式命令运行。

### 2. Search / Context 激进优化

- Rust 继续推进 search hot path：
  - rg JSON parse 从 line-by-line 进一步升级为 stdout chunk/bulk parse。
  - context formatting 减少 JSON 重复传输，优先传 file id + range 或 grouped file payload。
  - search result formatter 增加更强的去噪、排序、去重、预算压缩策略。
- JS 继续负责：
  - 启动 rg/fd
  - FS 读取
  - path adapter
  - tool integration
  - extension override
- 激进目标：
  - 大搜索结果处理不成为模型等待瓶颈。
  - 工具结果更短、更准、更适合模型继续执行。

### 3. Transcript / Model Task Quality 优化

- Rust 增强 transcript policy：
  - 长 transcript rebuild 走 batch native。
  - 更精细的 visible/context budget。
  - 工具结果、错误、用户意图、assistant stop/error 的优先级排序。
  - compaction 前后的模型可用信息不丢关键任务状态。
- JS 保留：
  - message/component mutation
  - markdown/custom renderer
  - session/pi-agent orchestration
- 激进目标：
  - 长会话下模型更少“忘上下文”。
  - compaction 后任务连续性更强。
  - 工具失败/重试状态更容易被模型利用。

### 4. TUI / Streaming Render 深度优化

- 基于 `planFramePatch` 继续压缩 frame pipeline：
  - 合并更多纯 planning 到单次 native plan。
  - 对 streaming append、tool status update、loader/status line 做专门 fast path。
  - 引入 render replay，记录 line count、changed range、patch count、write time。
- 不做全 Rust renderer，除非 benchmark 证明 JS renderer 是主瓶颈。
- JS 继续负责：
  - component tree
  - custom renderer
  - themes/colors
  - terminal writer
  - extension UI
- 激进目标：
  - 长回复 streaming 下 TUI 不抖、不阻塞输入。
  - 连续工具流状态刷新更轻。
  - frame diff 继续减少 bridge 调用和重复扫描。

### 5. Shell / Tool Execution 反馈链路

- `pi-shell-executor` 继续 sidecar，不塞进 N-API。
- 下一阶段重点不是重写 shell，而是优化反馈链路：
  - stdout/stderr streaming replay
  - 大输出截断策略
  - abort/timeout/process tree 状态回传
  - tool result 给模型的摘要质量
- 激进目标：
  - 模型能更快判断命令是否卡住、失败、成功或需要下一步。
  - 用户看到的 shell 状态更实时、更少阻塞。

### 6. Bridge / Serialization 成本治理

- 保留 JSON bridge 作为默认，直到 benchmark 证明它是瓶颈。
- 若 JSON 成本明确过高，再推进：
  - N-API object API
  - compact wire payload
  - interned file ids / line buffers
  - chunk parser
- 不提前重写 bridge，避免把复杂度加在没有数据证明的地方。

## Implementation Order

1. 创建 `docs/RUST_OPTIMIZATION_NEXT_PHASE_PLAN.md`，写入本计划。
2. 扩展 `npm run rust:bench`，拆分轻量 benchmark 和重型 replay。
3. 建立 replay fixtures 目录和统一 JSON 输出格式。
4. 先优化 search/context：rg bulk parse、grouped context payload、工具结果压缩质量。
5. 再优化 transcript/model task quality：长 transcript、compaction、任务状态保真。
6. 再优化 TUI streaming：frame replay、append/status fast path、更多 pure plan 合并。
7. 最后优化 shell/tool feedback：大输出、abort、timeout、模型摘要。
8. 每轮优化必须用 replay 数据决定是否继续 Rust 化。
9. 如果某模块 benchmark 收益不足，停止 Rust 化，回到 JS 简化或策略优化。

## Test Plan

每个阶段必须通过：

- `npm test`
- `npm run rust:parity`
- `npm run rust:native`
- `npm run rust:bench`
- `cargo fmt --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`
- `PI_RUST_CORE=0 npm test`
- `PI_RUST_BRIDGE=cli node scripts/smoke-rust-shadow.mjs`

新增 replay 验收：

- 大仓库 search replay 不回退、不异常。
- rg 10k/100k JSON parse replay 有稳定 p50/p95。
- context formatting grouped payload 明显优于 repeated payload。
- 长 transcript replay 保持任务关键状态。
- TUI long streaming replay patch count 和 frame time 可观测。
- shell streaming replay 能正确保留 stdout/stderr/exit/abort/timeout 状态。

## Assumptions

- 下一阶段不是“继续全量 Rust 化”，而是“数据证明哪里慢就激进打哪里”。
- Rust 仍只接管稳定、纯计算、高频、可序列化核心。
- JS 扩展边界继续保留，不把 plugin、custom renderer、session、host side effects 写进 Rust。
- CLI/sidecar 保留为 shell 执行、parity、debug、fallback，不回到默认热路径。
- benchmark 结果优先级高于主观判断；没有 replay 数据不做大规模重写。
