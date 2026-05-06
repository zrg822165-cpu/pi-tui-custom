# TUI Performance Next Optimization Points

目标：继续优化 TUI 性能，但保持当前表面体验不变。工作流渲染、渐变字体、thinking/status 行、底部输入框、工具摘要文案和动画节奏都视为已定稿；后续只动缓存、无效计算、脏区传播、诊断和数据结构。

## Local Reference Findings

### OpenCode

- 本机 `.opencode` 安装的脚本层很薄，`@opencode-ai/sdk` 只负责启动 `opencode` 或 `opencode serve`，TUI 通过 `/tui/*` 控制接口与事件接口暴露。
- `@opencode-ai/plugin` 把 `@opentui/core` / `@opentui/solid` 放在 peer dependency，说明真正的 TUI 渲染偏底层 renderer 与响应式 UI，而不是在插件 JS 层反复拼大文本树。
- 可迁移点：把 TUI 更新当成事件流处理；高频状态只更新最小区域；跨帧不重复计算 session、layout、宽度和 markdown token。

### Claude Code

- WSL 启动记录显示 `claude` 也是薄启动壳，配置中关闭了非必要流量：`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。
- 可见会话/设置更偏事件记录，不像把整屏状态作为大对象反复重建。
- 可迁移点：渲染层维持“文本流 + 少量 live line”；工具和思考状态增量更新；详细内容按需展开。

## Highest-Value Optimization Targets

### 1. Footer Render Cache

当前风险点：

- `components/footer.js` 的 `render(width)` 每次都会遍历 `session.sessionManager.getEntries()` 累加所有 assistant usage。
- footer 没有 `__piRenderCacheSafe` 和内部输出缓存，因此任何正常 `requestRender()` 都会重新算 footer，即使只有 chat 或 editor 改了一行。

建议实现：

- 给 `FooterComponent` 增加内部 cache key：`width + session id/version + model id + context usage + autoCompact + provider count + git branch + extension status version`。
- usage 累加改成增量缓存：维护 `entriesLength` 或 session revision，只有 entries 增长/切会话/compaction 后才重算。
- 给 `FooterDataProvider` 或 `FooterComponent` 增加显式 version，branch/status 变化时 bump。
- 给 footer 标记 `__piRenderCacheSafe = true`，配合内部 cache 避免 root render 时重复构造同样两三行。

预期收益：

- 普通 streaming、工具更新、editor 输入触发 render 时，footer 从 O(session entries) 降到 O(1)。
- 长会话收益明显，且不会影响任何可见 UI。

### 2. Streaming Assistant Markdown Incrementalization

当前风险点：

- `AssistantMessageComponent.updateContent()` 每次会 `clear()` 并重新创建 `Markdown` 子组件。
- streaming delta 期间如果频繁刷新 assistant 文本，Markdown 会反复 lexer + wrap。
- `AssistantMarkdown.render()` 每次还会调用 `visibleWidth("● ")`，虽然很小，但这是热路径里的固定常量。

建议实现：

- `AssistantMessageComponent` 保留第一段文本的 `AssistantMarkdown` 实例，只在文本变化时 `setText()`，不要每次 `clear()`。
- 对后续文本/thinking block 建立按 content index/type 的组件复用。
- `AssistantMarkdown` 的 prefix width 改成常量 `2` 或模块级缓存。
- streaming flush 保持当前节流语义，但加入“文本未变化直接跳过 updateContent”。

预期收益：

- 大段回复流式输出时，减少组件分配、Markdown lexer 和 container dirty 传播。
- 表面输出不变。

### 3. Tool Flow Signature Narrowing

当前风险点：

- `ToolFlowSummaryComponent.getCollapsedSignature()` 对每个工具的 `args` 做 `JSON.stringify`。
- 工具参数较大或工具数量多时，折叠态摘要每次 update 都会重复序列化。

建议实现：

- 在 `ToolExecutionComponent` 上维护轻量 `summaryVersion` / `targetSignature`，`updateArgs()` 时更新一次。
- `ToolFlowSummaryComponent` 的 signature 只读 `toolCallId/toolName/isPartial/resultState/summaryVersion`。
- representative target 也缓存在工具组件上，避免每次从 args 里重新抽取。

预期收益：

- 连续工具调用时减少字符串化和 Map/Array 临时对象。
- 不改变工具流聚合文案。

### 4. Width / ANSI Utilities Hot-Path Cache

当前风险点：

- `visibleWidth()` 对非 ASCII/ANSI 字符串已有 512 项 cache，但状态行、footer、border、tool line 这类短 ANSI 文本会持续生成新字符串，命中率有限。
- `applyLineResets()` 每次 full render/diff render 都对所有行跑 `normalizeTerminalOutput(line) + reset`，即使绝大多数行没变。

建议实现：

- 增加 `lineNormalizeCache`：key 为原始 line 字符串，value 为 normalized+reset；用小型 LRU，默认 1024。
- 对 `visibleWidth()` 的 ANSI stripping 结果增加二级 cache，或者给 `truncateToWidth()` 返回 width 时复用已算宽度。
- 状态行 patch 已经绕开 full render，保持现状；这个优化只针对 fallback render。

预期收益：

- 长 transcript 下普通 render 的 normalize/width 开销下降。
- 不影响宽字符安全逻辑。

### 5. TUI Diff Window Optimization

当前风险点：

- `TUI.doRender()` 找 changed lines 时扫描 `max(newLines.length, previousLines.length)`。
- chat 很长但只有底部 editor/footer 变化时，仍然线性扫完整 transcript。

建议实现：

- 先比较常见尾部区域：从底部向上找 footer/editor/status 的变化窗口；如果尾部能确定 first/last changed，就跳过全量扫描。
- 或引入 per-child line ranges：每次 render 后记录 root child 的 line span，已知 dirty child 时只 diff 对应 span。
- 初期可以只做诊断：在 `PI_TUI_PERF_DETAIL=1` 里记录 `diffScannedLines`、`firstChanged`、`lastChanged`，确认收益面。

预期收益：

- 长会话里编辑输入、footer变化、非 live patch fallback 更轻。
- 这是结构性优化，建议排在 footer/markdown 之后。

### 6. Editor Layout Cache

当前风险点：

- `Editor.render(width)` 每次都 `layoutText(layoutWidth)`，再对每行做 `visibleWidth()` 和 cursor compositing。
- 输入框文本不变但其他区域触发 render 时，editor 也会全量 layout。

建议实现：

- 给 editor 增加 layout cache key：`textVersion + cursorLine + cursorCol + layoutWidth + autocompleteVersion + focus state + scrollOffset`。
- `layoutText()` 结果单独缓存；只有文本、宽度或 cursor 变了才重算。
- autocomplete 打开时保留现有 render，避免误缓存候选列表。

预期收益：

- 工具/streaming 触发 render 时底部 editor 成本下降。
- 输入体验保持一致。

### 7. Component Dirty Boundary

当前风险点：

- `Container.markDirty()` 现在会一路向父级传播。
- 高频组件如果没有走 `patchMarkedLine()`，很容易污染 chat root，导致大片区域重新 render。

建议实现：

- 引入可选 `dirtyBoundary` 或 `isolatedCache`，让 `statusContainer`、`footer`、`editorContainer` 这类稳定区域可以作为缓存边界。
- 先只加到非 chat 区域，避免工具/assistant 内容生命周期变复杂。
- 配合 frame log 记录 `dirtyRoot`、`dirtyChildren`，确认没有隐藏全量重绘。

预期收益：

- fallback render 时减少无关 container 失效。
- 接近 OpenCode/Claude Code 的“事件只污染局部”思路。

### 8. Timer Consolidation Audit

当前风险点：

- 已知 `ThinkingStatusComponent` 有 50ms timer，其他组件如 `Loader`、`CountdownTimer`、`Armin/Daxnuts` 也会 setInterval。
- 多 timer 并发时，即使 requestRender coalescing 存在，也会增加 JS wakeup 和无效 render 请求。

建议实现：

- 增加全局 lightweight animation scheduler：timer 组件注册 `nextFrame()`，由一个 interval 派发。
- 不改变各组件帧率，只合并 wakeup。
- 先只迁移 thinking/status 和 loader，娱乐/特殊组件后置。

预期收益：

- 多状态并发时减少 event loop 抖动。
- 对观感无影响，但实施面比前几项稍大。

## Suggested Implementation Order

1. Footer render cache：已落地。
2. Assistant streaming markdown 组件复用：已落地；纯文本 streaming 复用单个 Markdown 组件。
3. Tool flow signature narrowing：已落地；summary signature 不再 JSON.stringify(args)。
4. normalize/width hot-path cache：已落地；line reset 与 clean visible width 有 LRU cache。
5. Editor layout cache：已落地；layoutText 按 layoutVersion/width/cursor 缓存。
6. Loader/editor activity timer 空转收紧：已落地；文本未变化时跳过 requestRender，activity label/width 按帧缓存。
7. Diff window / dirty boundary：已落地第一阶段 tail-window/append-fast/visible-tail-clean diff；真正 per-child dirty boundary 暂缓到有更多 frame log 后。
8. Assistant 吐字路径：普通单段 Markdown 轻量渲染、streaming 内容签名跳过 requestRender 已回滚；它们会造成吐字节奏不均匀。后续只做不吞帧的 render/diff 层优化。
9. Timer consolidation：暂缓；先保留现有动画 cadence，只消除各 timer 内部的无效 render。

## Measurement Plan

- 用 `PI_TUI_FRAME_TIMING_LOG` 跑三类场景：长回复 streaming、连续工具流、长会话底部输入。
- 开 `PI_TUI_PERF_DETAIL=1`，新增或关注字段：`reason`、`dirtyRoot`、`dirtyChildren`、`lineCount`、`diffScannedLines`、`diffMode`、`diffWindowStart`。
- 开 `PI_TUI_STREAM_TIMING_LOG` 诊断吐字节奏，关注 `eventGapMs`、`flushGapMs`、`queuedDelayMs`、`deltaLength`、`textLength`，并与 frame timing 的 `render/diff/write` 对齐。
- 对比指标：
  - `footer` 优化后：普通 render 的 `render` 时间在长会话下明显下降。
  - `markdown` 优化后：长回复 streaming 的 `render` p95 下降，组件分配减少。
  - `tool signature` 优化后：连续 tool update 的 render/request 数不变，但 JS CPU 更低。
  - `diff window` 优化后：尾部变化应主要显示 `diffMode=tail-window`、`append-fast` 或 `visible-tail-clean`，`diffScannedLines` 不再跟 transcript 总行数同步增长。

## Guardrails

- 不改可见文案、颜色、动画 tick、spinner 帧表、布局高度。
- 不引入新依赖。
- 每项优化都同步到 `patches/baseline-claude-flow-v3`。
- 每项至少执行 `node --check`；涉及渲染的改动跑一次手动 TUI 场景和窄终端场景。
