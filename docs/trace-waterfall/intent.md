# Intent：瀑布时间线（音视频导播）

> 组件名暂沿用 `TraceWaterfall`，仅为历史命名；实际定位是音视频导播 / 剪辑类时间线。
> 参考视觉：<https://kobra.systems/components/trace-waterfall>，只借布局与交互，不引入其业务语义。

## 1. 背景

`react-av-timeline` 现有的水平时间轴（`packages/Component.tsx`）是「磁带模型」：

- 所有 item 按百分比铺在一条带上，容器整体 `translateX`，让播放头固定；
- `time` 只能表达「起止时间」，没有轨道概念，一条时间轴只有一行；
- 重叠只能用 `level` 往下堆，无法表达「多个场景 / 多路音轨并行」；
- 刻度只能是原始数字，无法显示 `00:00:01.000` 或 SMPTE 时间码；
- 没有「按当前时间反查在播内容」的能力。

垂直时间轴（`Vertical`）虽然能做到「唱完一段就上移」，但它是一条序列，不能多轨并行。

导播场景同时需要这两件事：**多轨并行** + **播放时游标固定、过期内容上移**。

## 2. 定位与用户

| 用户 | 场景 | 关注点 |
|---|---|---|
| 导播 / 剪辑工具前端 | 把场景切换、字幕、音轨排在同一条时间线上 | 多轨、起始/时长、时间码、播放头、当前在播 |
| 音视频工具开发者 | 在自己的产品里嵌入只读时间线 | npm 可用、无额外依赖、可换肤 |
| 本库使用者 | 从 v2 的 `items` 迁移 | 不破坏现有 API |

明确不是：Agent / LLM trace 调试工具。span 树、token、cost、模型调用次数、错误统计都不在本期范围内。

## 3. 目标（Goals）

- **G1 多轨多片段**：一条轨道可以放多个片段，也可以有多条轨道；每个片段有 `start`、`duration`、`index`（轨道号），互不干扰。
- **G2 可配置时间轴与格式**：视图自带 `start + duration`；刻度支持纯数字、`00:00:01.000`、SMPTE `00:00:00:00`（可设帧率与起始偏移）。
- **G3 `currentTime` 反查与 seek**：给定 `currentTime` 返回该时刻所有活跃片段（闭区间），点击标尺可回调 `onCurrentTimeChange`。
- **G4 瀑布图布局**：左侧固定标签列、吸顶时间标尺、竖向网格、多档缩放、搜索、点击片段看详情。
- **G5 可配置视口跟随**：横向「固定播放头」（播放时游标停在可配置位置）与纵向「首行跟随」（按时间平铺后逐行上滚或消失，第一个仍在时长内的行贴顶）独立开关。
- **G6 只展示时间**：顶部只显示「当前时间 / 总时间」，不做成本、token、调用次数等业务指标。
- **G7 零破坏、零依赖、可换肤**：作为新组件加入，`Timeline` 与 `Vertical` 不变；只用 React + SCSS Modules；颜色与尺寸走 CSS 变量。

## 4. 非目标（Non-goals）

一期明确**不做**：

1. 片段编辑：拖拽移动、裁剪、吸附、转场、关键帧、多选。只读 + 播放头定位。
2. Agent / trace 语义：span 树、token、cost、模型调用、状态、指标栏、图例、最慢排行。
3. 大列表虚拟滚动（超过阈值记录为已知限制）。
4. SMPTE 丢帧（drop-frame）与 23.976 / 29.97 分数帧率。
5. 拖拽平移、框选缩放、触控板捏合缩放。
6. 导出图片 / JSON。
7. 引入 Tailwind、Radix、floating-ui 等 UI 依赖。
8. 替换或重构现有 `Component.tsx` / `Vertical.tsx`。
9. 波形渲染（音频波形由使用方以片段背景提供）。

## 5. 成功标准

- 用 `example/data.ts` 的歌词构建歌词时间线（重叠行自动分轨）；用 `order` + `characters` 构建歌手时间线（每位歌手一条轨道），播放时「当前时间 / 总时间」实时正确。
- 给定 A/B/C 用例，`getActiveAt` 在 0/1/2/3 分别返回 `[A]` / `[A,B,C]` / `[B,C]` / `[C]`。
- 同一份数据分别用纯数字、`HH:MM:SS.mmm`、SMPTE 渲染，刻度位置一致、文案正确。
- `currentTime` 超出视图范围时被钳制，视图范围外的片段不参与命中；晚于 `viewEnd` 的部分正常渲染并压暗。
- 开启固定播放头后播放，从起点到终点游标屏幕位置都不变、内容左移；开启首行跟随，越界行上移。
- 现有 `__tests__/timeline.test.tsx` 全部通过；新增测试覆盖 spec §13。
- `bun run build` 通过。

## 6. 约束

- 构建：Vite lib 模式（`formats: ['es']`）+ `rollup-plugin-typescript` + SCSS Modules。
- 测试：`bun test` + happy-dom + `@testing-library/react`。
- 语言：默认中文文案，关键文案可通过 props 覆盖。
- 时间：内部一律纯数值，不换算单位；`unit` 只影响显示。
- 帧率：SMPTE 只接受正整数 `fps`。

## 7. 数据模型与核心语义

```ts
interface TimelineClip {
  id: string
  name?: string          // 行标签与搜索文案，缺省用 id
  index: number          // 轨道号，相同 index 即同一轨
  start: number
  duration: number       // 唯一结束依据
  label?: ReactNode
  color?: string
  style?: CSSProperties
  meta?: Record<string, unknown>
}

interface TimelineTrack {
  index: number
  name?: string
}
```

### 7.1 视图范围（已确认）

- 可达范围 `[start, start + duration]`，`currentTime` 越界钳制到端点。
- 早于 `start` 的部分按左边界裁切；晚于 `start + duration` 的部分正常渲染并压暗，但不可 seek。
- 视图外的片段不参与命中。
- 交互 seek 同样走钳制。

### 7.2 时间格式

```ts
type TimeFormat =
  | { type: 'number' }
  | { type: 'clock', millisecond?: boolean, offset?: number }
  | { type: 'smpte', fps: number, offset?: number }
```

- 内部时间始终是 `0 1 2 3` 这样的纯数值，SMPTE 只是显示层：`显示 = format(offset + value, fps, unit)`。
- `offset` 用同一数值单位表达起始时间；不引入时间码字符串解析。
- 推荐字段只有 `fps` + `offset`；不做 `dropFrame`、分数帧率。

### 7.3 活跃片段（闭区间）

判定：`clip.start <= time <= clipEnd`，**两端都包含**。

用例（A: 0–1，B: 1–2，C: 1–3）：

| currentTime | 命中 |
|---|---|
| 0 | A |
| 1 | A、B、C |
| 2 | B、C |
| 3 | C |

推论：

- 相邻片段在交界点会同时命中，返回数组；
- 同一 `index` 内重叠时**后者覆盖前者**：按声明顺序绘制，后者在上层，点击命中最上层；查询仍返回全部，另提供取顶层的方法；
- 覆盖只发生在同一 `index` 内；
- 点击片段**不 seek**，只打开详情；seek 来自标尺点击与外部输入（滑块 / 播放器）。

## 8. 视口跟随（G5）

两个行为独立开关，默认关闭。

1. **固定播放头**：`scrollLeft` 由 `currentTime` 驱动，游标停在 `playheadPosition`（0–1，默认 0.5）对应的屏幕位置。视图起点前留 `lead`、终点后留右侧空白，保证从起点到终点游标都固定，不会在两端被推到边缘。
2. **首行跟随**：前提是**按时间顺序平铺**——所有片段按 `start` 排开，一个片段一行，重叠片段也各占一行（A1、B1、A2、B2 依次向下）。在这个布局上：
   - `上滚`：时间越过某行 `end` 后，该行滚出视口，第一个仍在时长内的行贴到标尺下方；
   - `直接消失`：时间越过某行 `end` 后，该行直接折叠，第一个仍在时长内的行自然贴顶；
   - 开启跟随时强制平铺，`layout` 被忽略；要回到多轨必须关闭跟随（多轨的行是轨道，不参与）。

## 9. 决策记录

| # | 问题 | 结论 |
|---|---|---|
| 1 | 超出去的部分 | 晚于 `viewEnd` 正常渲染并压暗；早于 `viewStart` 裁切；`currentTime` 钳制、范围外不参与命中 |
| 2 | 同轨重叠 | 后者覆盖前者 |
| 3 | SMPTE 字段 | `fps` + `offset`，不做 drop-frame |
| 4 | currentTime 写回 | 受控 + `onCurrentTimeChange`；点击片段只开详情 |
| 5 | 指标栏 | 取消；只保留当前时间 / 总时间 |
| 6 | trace 语义 | 取消；数据模型只保留 clips / tracks |
| 7 | 两种行布局 | `lanes`（按 index 分行）与 `sequence`（按时间平铺，一行一个片段，支持首行跟随） |
| 8 | 首行跟随形态 | 开启时自动切平铺；支持「上滚」与「直接消失」两种 |
| 9 | 版本 | `3.0.0` |
| 10 | 片段结束 | 只保留 `duration`，移除 `end` |
| 11 | 固定播放头 | 加 `lead` + 右侧留白，起点到终点游标都固定 |
| 12 | followMode 与 layout | `followMode !== 'off'` 时强制 `sequence`，`layout` 被忽略 |
| 13 | 活跃查询返回值 | `getActiveAt` 返回全部；`getTopActiveAt` 返回每轨最后一个，按轨道号升序 |
| 14 | 时长格式 | `formatDuration` 不叠加 `offset` |
| 15 | 文案 | 新增 `labels` 覆盖；统一用“片段” |
