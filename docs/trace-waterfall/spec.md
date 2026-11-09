# Spec：瀑布时间线（音视频导播）

对应 intent：`docs/trace-waterfall/intent.md`
状态：v10，已确认（2026-11-09），本文是实现的唯一依据

> v10 变更（2026-11-09）：`clip.height` 改为只控制条形高度，不再影响行高；行高统一由 `track.height` / `rowHeight` / `--wf-row-h` 决定，避免相邻行一高一矮。
> v9 变更（2026-11-09）：条形高度改为跟随行高自适应（`max(6px, 100% - 2 × --wf-bar-inset)`），避免自定义行高后标签区域出现大片空白。
> v8 变更（2026-11-09）：新增 `rowGap`，行与行之间支持纵向间距；标签高度即行高，跟随滚动偏移同时累计行高与行间距。
> v7 变更（2026-11-09）：滚动条改为细圆角内缩滑块，横向 / 纵向统一，新增 `--wf-scroll` / `--wf-scroll-hover` 主题变量，并补充 Firefox 的 `scrollbar-width` / `scrollbar-color`。
> v6 变更（2026-11-09）：新增播放状态 `playing`，播放中且启用固定播放头 / 首行跟随时锁定纵向滚动；新增 `rowHeight` 默认行高，片段与轨道可通过 `height` 单独定义行高，跟随滚动按真实行高累计偏移。
> v5 变更（2026-11-09）：左侧标签列支持拖拽调整宽度（`resizableLabel` / `minLabelWidth` / `maxLabelWidth` / `onLabelWidthChange`）；`followMode` 新增 `keepRowsAbove`，两种模式都可保留目标行上方若干行；`number` 格式固定 3 位小数。
> v4 变更（2026-11-09）：按确认记录关闭 D1-D12。版本改为 `3.0.0`；数据模型只保留 `duration`；视图外内容正常渲染并压暗，`currentTime` 仍钳制在视图内；固定播放头增加左右留白，游标全程固定；`followMode` 非 `off` 时强制平铺；修正 SMPTE / clock 换算；导出 `getActiveAt` / `getTopActiveAt`；拆分 `formatDuration`；新增 `labels`、测试钩子、刻度、颜色、详情、跟随 + 搜索等细节。
> v3 变更（2026-11-09）：定位改为音视频导播时间线；数据模型只保留 `clips` / `tracks`；删除 trace 语义（`spans`、`now`、tokens/cost/status）、指标栏、图例、最慢排行；顶部只保留当前时间 / 总时间；新增 `layout`（lanes / sequence）。

## 0. 确认记录

| # | 决策 |
|---|---|
| D1 | 版本 `3.0.0` |
| D2 | 修正 `unitMs` 方向；clock / SMPTE 统一先换算 `totalMs`；拆分 `formatDuration` |
| D3 | 采用 MVP 的 `lead`，并补右侧留白，固定播放头全程固定 |
| D4 | `followMode !== 'off'` 时无论如何都渲染 `sequence`，`layout` 被忽略 |
| D5 | 片段只有 `duration`；超出视图的内容正常渲染并压暗，`currentTime` 达不到 |
| D6 | 导出 `getActiveAt` / `getTopActiveAt`；后者返回每轨最后一个，按轨道号升序 |
| D7 | `formatDuration` 不叠加 `offset`；总时长、片段时长、tooltip、sequence 右侧时长都用它 |
| D8 | 空数据时显示时长为 0，几何分母按 1 |
| D9 | 当前时刻所有 active 片段都高亮 |
| D10 | 新增 `labels`；统一用“片段”，不再出现“步骤” |
| D11 | 组件名保留 `TraceWaterfall`；内部文件改为 `waterfall.ts` / `waterfall.module.scss`；旧测试整体重写 |
| D12 | 示例使用 `example/data.ts` 的歌词与 `order` / `characters`；`mvp/` 保留为视觉参考，不是实现依据 |

## 1. 范围与文件

| 动作 | 文件 | 说明 |
|---|---|---|
| 重写 | `packages/waterfall.ts` | 类型 + 纯函数：范围、行构建、活跃查询、刻度、格式化 |
| 重写 | `packages/TraceWaterfall.tsx` | 组件，默认导出 |
| 重写 | `packages/waterfall.module.scss` | 样式，全部基于 CSS 变量 |
| 修改 | `packages/index.ts` | 增加组件与类型导出 |
| 修改 | `example/App.tsx` | 用歌词 + 歌手数据演示两条时间线 |
| 不改动 | `example/data.ts` | 歌词 `data`、歌手顺序 `order`、角色 `characters` |
| 重写 | `__tests__/trace.test.tsx` | 验收测试（§13），替换现有 v1 trace 测试 |
| 修改 | `README.md` | 使用方式与 API |
| 不改动 | `packages/Component.tsx`、`packages/Vertical.tsx`、`packages/utils.ts` | 现有 API 与行为保持原样 |

- 旧的 `packages/trace.ts`、`packages/trace.module.scss` 在迁移后删除。
- `mvp/` 保留为视觉参考，不作为唯一依据；实现以本文为准。

## 2. 数据模型

```ts
export interface TimelineClip {
  id: string
  name?: string          // 行标签与搜索文案，缺省用 id
  index: number          // 轨道号，相同 index 即同一轨
  start: number
  duration: number       // 唯一结束依据，不再支持 end
  label?: ReactNode      // 条形内自定义内容，缺省用 name
  color?: string
  style?: CSSProperties
  height?: number        // 条形高度，不超过行高减上下留白
  meta?: Record<string, unknown>
}

export interface TimelineTrack {
  index: number
  name?: string
  height?: number        // 行高，缺省用 rowHeight 或 --wf-row-h
}
```

- `clipEnd = clip.start + Math.max(clip.duration, 0)`。
- `duration <= 0` 视为点片段：条形宽度 2px，仅在 `start` 时刻命中（闭区间）。
- 时间单位由 `unit` 声明（默认 `'s'`），组件内部不做换算。
- 不提供 `end`，也不做 `end < start` 的兼容。

## 3. 时间模型

### 3.1 视图范围（可 seek 范围）

```
viewStart    = props.viewStart ?? (clips.length ? min(clip.start) : 0)
viewEnd      = viewStart + max(props.viewDuration ?? (clips.length ? max(clipEnd) - viewStart : 0), 0)
displayDuration = max(viewEnd - viewStart, 0)
geometryDuration = max(displayDuration, 1)
```

- `viewStart` / `viewDuration` 非有限数时按缺省处理。
- `currentTime`、seek 结果、命中查询输入统一先钳制到 `[viewStart, viewEnd]`。
- 视图为空时 `viewStart = 0`、`viewEnd = 0`、`displayDuration = 0`、`geometryDuration = 1`。

### 3.2 渲染范围（超出变黑）

```
maxClipEnd = clips.length ? max(clipEnd) : viewEnd
renderEnd  = max(viewEnd, maxClipEnd)
bodyWidth  = max(renderEnd - viewStart, 0) * pxPerUnit
viewWidth  = displayDuration * pxPerUnit
```

- `viewStart` 是左边界：早于 `viewStart` 的部分按 `viewStart` 裁切，不渲染。
- 晚于 `viewEnd` 的部分正常渲染，但覆盖一层 `--wf-dim` 压暗；该区域不可 seek，`currentTime` 钳制后也达不到。
- 完全落在 `viewStart` 左侧的片段不渲染条形；完全落在 `viewEnd` 右侧的片段渲染并整体压暗。
- 压暗层 `pointer-events: none`，不阻挡条形点击与详情。
- 条形的 `left`、`width` 仍按视图内像素计算；`bodyWidth` 只扩展画布和滚动区域。

### 3.3 时间格式

```ts
export type TimeFormat =
  | { type: 'number' }
  | { type: 'clock', millisecond?: boolean, offset?: number }
  | { type: 'smpte', fps: number, offset?: number }

formatTime?: TimeFormat | ((value: number) => string)
formatDuration?: (value: number) => string
```

优先级：`formatDuration` > 自定义 `formatTime` 函数 > 内置对象 > 默认 `{ type: 'clock', millisecond: true }`。

基础换算：

```
unitMs = unit === 'ms' ? 1 : 1000
totalMs = (offset + value) * unitMs
totalFrames = round((offset + value) * unitMs * fps / 1000)
```

| 类型 | 输出 | 说明 |
|---|---|---|
| `number` | `0.000`、`1.500` | 固定 3 位小数 |
| `clock` | `HH:MM:SS` / `HH:MM:SS.mmm` | 固定补零，与 `00:00:01.000` 一致 |
| `smpte` | `HH:MM:SS:FF` | `FF = totalFrames % fps`，两位补零 |

- `fps` 必须正整数，非法回退 25；`offset` 默认 0，且与 `value` 使用同一单位。
- `formatTime` 用于绝对时间，会应用 `offset`。
- `formatDuration` 用于时长，不应用 `offset`；未提供时由同一个内置格式派生（SMPTE / clock 从 0 开始）。
- 负值取绝对值格式化后加 `-`。
- 不实现 drop-frame 与分数帧率。

## 4. 组件 API

```ts
export interface TimelineLabels {
  search: string
  noMatch: (query: string) => string
  empty: string
  current: string
  total: string
  track: string
  start: string
  end: string
  duration: string
  close: string
  zoom: string
  resize: string
  lanesColumn: string
  sequenceColumn: string
}

export interface TraceWaterfallProps {
  // 数据
  clips: TimelineClip[]
  tracks?: TimelineTrack[]
  layout?: 'lanes' | 'sequence'      // 默认 'lanes'

  // 时间
  unit?: 'ms' | 's'                  // 默认 's'
  viewStart?: number
  viewDuration?: number
  currentTime?: number
  onCurrentTimeChange?: (time: number) => void
  formatTime?: TimeFormat | ((value: number) => string)
  formatDuration?: (value: number) => string

  // 视口
  fixedPlayhead?: boolean            // 默认 false
  playheadPosition?: number          // 0–1，默认 0.5
  playing?: boolean                  // 默认 false
  followMode?: 'off' | 'scroll' | 'hide' // 默认 'off'
  keepRowsAbove?: number             // 跟随时目标行上方保留行数，默认 0
  zoom?: number                      // 受控
  defaultZoom?: number               // 默认 1
  onZoomChange?: (zoom: number) => void

  // 外观
  labelWidth?: number                // 默认 220
  resizableLabel?: boolean           // 默认 true
  minLabelWidth?: number             // 默认 120
  maxLabelWidth?: number             // 默认 480
  onLabelWidthChange?: (width: number) => void
  rowHeight?: number                 // 默认行高，缺省由 --wf-row-h 决定
  rowGap?: number                    // 行间距，默认 0
  height?: CSSProperties['height']   // 默认 360
  minTickGap?: number                // 默认 64
  showTime?: boolean                 // 默认 true
  showDetail?: boolean               // 默认 true
  showSearch?: boolean               // 默认 true
  showZoom?: boolean                 // 默认 true
  emptyText?: string                 // 默认「暂无时间线数据」
  labels?: Partial<TimelineLabels>
  onClipClick?: (clip: TimelineClip) => void
  className?: string
  style?: CSSProperties
}
```

- `emptyText` 优先于 `labels.empty`。
- `showSearch=false` 时不渲染搜索框，也不接管 `⌘F` / `Ctrl+F`；`showZoom=false` 时不渲染内置缩放按钮，`zoom` 仍可由使用方受控。
- `showTime` 为真时在顶部渲染「当前：… 总：…」；没有 `currentTime` 时当前时间显示 `-`。
- 总时间用 `formatDuration(displayDuration)`，不叠加 `offset`。
- 当前时间用 `formatTime(clamp(currentTime))`。

默认文案：

| key | 默认值 |
|---|---|
| `search` | `搜索片段` |
| `noMatch` | `query => \`没有匹配 “${query}” 的片段\`` |
| `empty` | `暂无时间线数据` |
| `current` | `当前` |
| `total` | `总` |
| `track` | `轨道` |
| `start` | `开始` |
| `end` | `结束` |
| `duration` | `时长` |
| `close` | `关闭详情` |
| `zoom` | `缩放` |
| `resize` | `调整标签列宽度` |
| `lanesColumn` | `轨道` |
| `sequenceColumn` | `片段` |

## 5. 几何

```
trackWidth   = max(viewportWidth - labelWidth, 320)
pxPerUnit    = trackWidth / geometryDuration * zoom
viewWidth    = displayDuration * pxPerUnit
pos          = clamp(playheadPosition, 0, 1)
lead         = fixedPlayhead ? trackWidth * pos : 0
bodyWidth    = max(renderEnd - viewStart, 0) * pxPerUnit
rightPad     = fixedPlayhead
  ? max(0, trackWidth * (1 - pos) - max(0, bodyWidth - viewWidth))
  : 0
canvasWidth  = labelWidth + lead + bodyWidth + rightPad

x(t)         = (clampTime(t) - viewStart) * pxPerUnit
barLeft      = max(0, (max(start, viewStart) - viewStart) * pxPerUnit)
barWidth     = max((clipEnd - max(start, viewStart)) * pxPerUnit, 2)
cursorLeft   = labelWidth + lead + x(currentTime)
```

- `labelWidth` 可由 `labelWidth` 传入，也可在 `resizableLabel` 开启时通过标签列右边缘的把手拖拽或键盘（←/→、Shift 加速、Home 复位）调整；范围钳制到 `[minLabelWidth, maxLabelWidth]`。
- 行高按行解析：`sequence` 取 `track.height ?? rowHeight`；`lanes` 取 `track.height ?? rowHeight`。两者都没有时不写内联高度，沿用 CSS 变量 `--wf-row-h`。标签高度等于所在行高，与 `clip.height` 无关。
- 行与行之间的纵向间距由 `rowGap` 控制，作用在 `.rows` 的 `row-gap` 上，默认 `0`。
- 条形高度缺省为 `max(6px, 100% - 2 × --wf-bar-inset)`，随行高自动放大；`clip.height` 存在时以它为准，并用 `max-height` 限制在行高减上下留白以内。
- `viewportWidth` 由 `ResizeObserver` 监听 `.scroller`；无该 API 时用 `window.resize` + `clientWidth`。
- `lead` 在视图起点前留出空白，`rightPad` 在渲染终点后留出空白，二者保证固定播放头在起点和终点都停在 `playheadPosition`。
- 关闭固定播放头时 `lead = rightPad = 0`，保留原生滚动。
- 内置缩放档位 `[0.5, 1, 1.5, 2, 4, 8, 16]`；`showZoom=false` 时不渲染这组按钮，使用方可通过受控 `zoom` 自行缩放。关闭固定播放头时，缩放保持视口中心时间不漂移：

```
centerTime     = viewStart + (scrollLeft + clientWidth / 2 - labelWidth - lead) / pxPrev
centerTime     = clamp(centerTime, viewStart, viewEnd)
nextScrollLeft = max(0, labelWidth + lead + (centerTime - viewStart) * pxNext - clientWidth / 2)
```

- 固定播放头开启时，缩放后直接按 §7.2 重新定位 `scrollLeft`。

## 6. 行构建与绘制

### 6.1 `lanes`（默认）

1. 轨道集合 = `tracks` 声明的 `index` ∪ `clips` 中出现的 `index`，升序；重复 `index` 以首次声明为准。
2. 每行标签：`track.name ?? \`${labels.track} ${index}\``。
3. 行内片段按数组声明顺序渲染；重叠时后声明者绘制在上层（不设 `z-index`）。
4. `clips` 非空时，轨道没有片段仍渲染空行；`clips` 为空时整体走空态。

### 6.2 `sequence`（平铺）

1. **不按轨道分组**，所有片段按 `start` 升序拉平，`start` 相同按声明顺序。
2. 一个片段一行，行标签为 `clip.name ?? clip.id`，右侧显示该片段的轨道名与 `formatDuration(clip.duration)`。
3. 时间重叠的片段也各占一行，因此同一时刻可能连续出现多行（如 A1、B1、A2、B2）。
4. 这是首行跟随（§7.3）的前置布局。

### 6.3 重叠

- 仅 `lanes` 有意义：同一 `index` 内后者覆盖前者，点击命中最上层。
- `sequence` 下每个片段独立成行，不存在覆盖。
- 被覆盖片段仍参与 `getActiveAt`；需要「当前画面」用 `getTopActiveAt` 取同轨最后一个。
- 当前时刻所有 `getActiveAt` 命中的片段都加 `active` 描边（`--wf-active`）。

## 7. currentTime、seek 与视口跟随

### 7.1 seek

- `currentTime` 受控；未提供 `onCurrentTimeChange` 时组件不改变游标。
- 游标：`left = labelWidth + lead + x(clampTime(currentTime))`。
- 点击标尺：以 `.rulerTrack` 的 `getBoundingClientRect()` 为基准，且 `clientX < labelWidth` 时直接忽略：

```
time = viewStart + (clientX - rect.left) / pxPerUnit
onCurrentTimeChange?.(clampTime(time))
```

- 点击 `viewEnd` 右侧的压暗区域会钳制到 `viewEnd`。
- 点击片段：调用 `onClipClick` 并打开详情，**不调用** `onCurrentTimeChange`。
- 点击左侧标签：只打开详情，不 seek。
- 游标层级低于左侧标签列与吸顶标尺：横向滚动到标签列下方时被标签列遮住，不穿过标签列。

### 7.2 固定播放头 `fixedPlayhead`

```
playheadX = labelWidth + trackWidth * pos
scrollLeft = max(0, labelWidth + lead + x(t) - playheadX)
           = max(0, x(t))
```

- `lead` 与 `rightPad` 保证 `t` 从 `viewStart` 到 `viewEnd` 时游标都停在 `playheadPosition`，不会在开头贴左、也不会在结尾被推到右边缘。
- 在 `currentTime`、`zoom`、`playheadPosition`、`viewStart`、`viewDuration`、`viewportWidth` 变化时重算。
- 用户拖动横向滚动条后，下一次上述变化时会被纠正；暂停且无变化时允许自由滚动查看压暗区域。
- 关闭时保留原生滚动与 §5 的缩放锚定。

### 7.3 首行跟随 `followMode`

**布局优先级**：`followMode !== 'off'` 时，无论 `layout` 传什么，都渲染 `sequence`；`layout` 被忽略。要回到多轨，必须传 `followMode='off'`。

- **`scroll`（上滚）**
  - 目标行：当前渲染顺序中第一个 `start <= t <= end` 的行；没有则取第一个 `end >= t` 的行；都没有则不动。
  - `anchor = max(rowIndex - keepRowsAbove, 0)`，`scrollTop = Σ(anchor 之前各行的行高 + rowGap)`，目标行上方保留 `keepRowsAbove` 行，其余滚出视口；
  - 已结束的行仍保留在 DOM 中，只是滚出视口。
  - 搜索过滤后的可见行参与索引计算；被搜索隐藏的行不占行号。
- **`hide`（直接消失）**
  - 给 `end < t` 的可见行加 `display: none`，让其折叠；`keepRowsAbove > 0` 时，最近结束的 `keepRowsAbove` 行保留显示；
  - `scrollTop` 归零，第一个仍在时长内的行自然贴顶；
  - 时间回退时被隐藏的行重新出现。
- 行高优先取 `row.height`；未显式定义时用 DOM 实测高度，测试环境回退 32。
- `lanes` 的行是轨道，不参与纵向跟随；开启跟随时组件不应停留在多轨布局。

### 7.4 播放状态 `playing`

- `playing` 默认 `false`；只表示播放状态，不驱动 `currentTime`。
- `playing === true` 且 `fixedPlayhead === true` 或 `followMode !== 'off'` 时，滚动容器纵向锁定（`overflow-y: hidden`，`data-wf-locked="true"`），隐藏纵向滚动条并禁止手动纵向滚动；程序化的跟随滚动仍生效。
- `playing === false` 时恢复 `overflow-y: auto`，纵向可自由滚动。
- 纵向锁定不影响横向：固定播放头仍可按 `currentTime` 自动平移。

## 8. 标尺与网格

- 刻度值从整数步长开始：`first = ceil(viewStart / step) * step`，`value = first + k * step`，`value <= viewEnd`，最多 500 个。
- `step = niceStep(minTickGap / pxPerUnit)`，候选 `{1,2,5,10} × 10^n`。
- 文案用 §3.3 的 `formatTime`；网格 `background-size = step * pxPerUnit`，`background-position-x = (first - viewStart) * pxPerUnit`，保证网格与刻度对齐。
- 标尺只展示 `[viewStart, viewEnd]` 内的刻度；`viewEnd` 右侧的渲染区域用 `--wf-dim` 压暗，不显示刻度文案。
- 标尺 `sticky top`，标签列 `sticky left`，背景必须不透明。
- 测试钩子：`data-wf="scroller" | "canvas" | "ruler" | "ruler-track" | "row" | "bar" | "cursor" | "dim" | "empty" | "detail"`，并加 `data-wf-layout="lanes" | "sequence"`、`data-wf-locked="true" | "false"` 与 `data-wf="splitter"`。

## 9. 搜索

- 匹配 `clip.name` 与 `clip.id`，大小写不敏感。
- `lanes`：隐藏未命中的片段；整行无命中则隐藏该行。
- `sequence`：只保留命中的行。
- 命中片段用 `<mark>` 高亮；若命中只发生在 `id` 而标签展示的是 `name`，在标签后追加 `#id` 并对命中部分高亮。
- 无结果文案 `labels.noMatch(query)`；无数据显示 `emptyText`。
- `⌘F` / `Ctrl+F` 聚焦搜索框，仅在组件被 hover 或内部含焦点时接管；`showSearch=false` 时不渲染搜索框，也不接管快捷键。

## 10. 详情浮层

- 触发：点击条形或标签名称；`showDetail=false` 时不渲染。
- 内容：名称、轨道（`index · name ?? \`${labels.track} ${index}\``）、起点（`formatTime`）、结束（`formatTime`）、时长（`formatDuration`）、`meta` JSON。
- 位置：`left = clamp(clientX + 12, 12, innerWidth - 312)`，`top = clamp(clientY + 12, 12, innerHeight - 240)`；宽 300px，`max-height: 60vh`。
- 关闭：外部 `mousedown`、`Esc`、`×`。
- 语义：`role="dialog"` + `aria-label`。
- 无 `meta` 时不渲染 `<pre>`；序列化失败显示 `[无法序列化的数据]`。

## 11. 主题 Token

| 变量 | 用途 |
|---|---|
| `--wf-bg` / `--wf-sub` / `--wf-hover` | 背景 / 次级背景 / hover |
| `--wf-border` / `--wf-text` / `--wf-muted` | 边框 / 正文 / 次要文字 |
| `--wf-grid` | 网格与刻度线 |
| `--wf-clip-1` … `--wf-clip-6` | 未指定 `color` 时的片段配色 |
| `--wf-active` | 活跃片段描边 |
| `--wf-cursor` | 游标 |
| `--wf-dim` | 视图外压暗层 |
| `--wf-row-h` / `--wf-ruler-h` | 默认行高（可被 `rowHeight` / 片段 / 轨道覆盖） / 标尺高 |
| `--wf-scroll` / `--wf-scroll-hover` | 滚动条滑块 / 滑块 hover |
| `--wf-bar-inset` | 条形上下留白，默认 7px；条形高度随行高自适应 |

- 未指定 `color` 时按 `clip.color ?? var(--wf-clip-{(index % 6) + 1})` 取色。
- 深色：`prefers-color-scheme: dark` 覆盖背景、边框、文字、网格、压暗层。宽度 ≤ 720px：时间栏换行、搜索框占满。

## 12. 边界与性能

| 情况 | 行为 |
|---|---|
| `clips` 为空 | 标尺 + 空态文案，时间栏显示总时间 0，不渲染轨道空行 |
| `displayDuration <= 0` | 显示 0，几何分母按 1 |
| `duration <= 0` | 宽度 2px 的点片段，仅在 `start` 命中 |
| 片段完全在 `viewStart` 左侧 | 不渲染条形；若所有片段都在左侧，渲染空行 |
| 片段完全在 `viewEnd` 右侧 | 正常渲染并整体压暗，不参与 active |
| 全部片段在 `viewStart` 左侧 | 渲染空行，不显示条形 |
| 全部片段在 `viewEnd` 右侧 | 渲染压暗条形，`currentTime` 停在 `viewEnd` |
| 重复 `id` | 不做去重，`lanes` / `sequence` 的 key 都追加行/片段索引 |
| 行数 > 2000 | 一期不做虚拟滚动 |
| SSR | 仅 effect 内访问 `window` / `ResizeObserver` |
| React 16 | 不使用 `useId`、`useSyncExternalStore` |

## 13. 验收测试矩阵

固定用例：

```
clips: A{index:0, 0–1}, B{index:1, 1–2}, C{index:2, 1–3}
重叠: D{index:0, 0–5}, E{index:0, 2–3}
```

| # | 用例 | 断言 |
|---|---|---|
| 1 | lanes 分行 | A/B/C 三轨三行，行标签为轨道名 |
| 2 | sequence 分行 | 每片段一行，按 start 升序；相同 start 按声明顺序 |
| 3 | 缩放 | 以 D（0–5）为基准，1x/2x/0.5x 条形宽度为 320/640/160px |
| 4 | 游标 | `currentTime=0.5` 时按公式定位（labelWidth 220 + 0.5 × 64） |
| 5 | `getActiveAt` | 0→`[A]`、1→`[A,B,C]`、2→`[B,C]`、3→`[C]` |
| 6 | 重叠 | E 在 D 之后绘制；`getTopActiveAt(2)` 返回 `[E]` |
| 7 | 视图范围 | `viewDuration=1` 时 C 的条形延伸出视图并出现压暗层；`currentTime=3` 钳制为 1 |
| 8 | 点击标尺 | 回调收到像素对应时间（含 `viewStart` 偏移）；压暗区钳制到 `viewEnd` |
| 9 | 点击片段 | `onClipClick` 被调用；`onCurrentTimeChange` **不**被调用；详情打开 |
| 10 | 时间格式 | `unit:'s', fps:25, offset:36000` 时 0 显示 `10:00:00:00`；`formatDuration(0)` 显示 `00:00:00:00`；`unit:'ms', clock` 下 1000 显示 `00:00:01.000` |
| 11 | 时间栏 | 同时显示当前时间与总时间；无 `currentTime` 时当前为 `-` |
| 12 | 固定播放头 | 起点游标在 `labelWidth + lead`；`scrollLeft` 等于 `x(t)`；终点仍固定；关闭后不被改写 |
| 13 | 首行跟随 | 即使 `layout='lanes'`，开启后也按平铺渲染；`scroll` 下 `scrollTop` 等于目标行索引 × 行高；`hide` 下 `end < t` 的行被折叠；`off` 下不改 |
| 14 | 搜索 | 命中片段保留、其余隐藏；无结果显示含“片段”的空态 |
| 15 | 单位一致 | `ms` / `s` 下条形像素位置相同，仅文案不同 |
| 16 | 压暗层 | `viewEnd` 右侧存在 `data-wf="dim"`，宽度等于超出像素；点击不阻挡详情 |
| 17 | labels 覆盖 | 传入 `labels.search` / `labels.noMatch` 后文案生效 |
| 18 | 搜索 / 缩放开关 | `showSearch=false` 时不渲染搜索框；`showZoom=false` 时不渲染缩放按钮；受控 `zoom` 改变条形宽度 |
| 19 | 标签列宽度 | 默认 220；`labelWidth` 生效；拖拽把手改变宽度并回调；`resizableLabel=false` 时不渲染把手 |
| 20 | `keepRowsAbove` | `scroll` 下按累计行高滚动到 `anchor = max(rowIndex - keepRowsAbove, 0)`；`hide` 下最近结束的 N 行保留 |
| 21 | number 格式 | `1.5 → 1.500`，时间栏当前 / 总时间同样固定 3 位小数 |
| 22 | `playing` 锁定 | `playing + fixedPlayhead` 或 `playing + followMode` 时 `data-wf-locked="true"`；默认 / 暂停时为 `false` |
| 23 | 行高 / 块高 | `clip.height` 只改条形高度；`track.height` / `rowHeight` 改行高；轨道行高参与跟随滚动累计偏移 |
| 24 | `rowGap` | `.rows` 的 `row-gap` 生效；跟随偏移累计行高 + 行间距 |

测试注意：`bun test` 下 `@testing-library/react` 不会可靠自动 cleanup，需显式 `afterEach(cleanup)`；`happy-dom` 下 `clientWidth` / `offsetHeight` 为 0，相关用例需 mock 或在公式中回退。

## 14. 兼容性与发布

- 仅新增命名导出：`TraceWaterfall`、`TimelineClip`、`TimelineTrack`、`TimelineLabels`、`TimeFormat`、`TimelineRange`、`TimelineRow`、`TraceWaterfallProps`，以及纯函数 `getActiveAt`、`getTopActiveAt`、`getClipEnd`、`resolveRange`、`buildRows`、`buildTicks`、`formatTime`、`formatDuration`。
- 默认导出仍为水平时间线组件（`packages/Component.tsx`），不是 `Timeline` 命名导出；`PropsType` / `itemsType` 不变。
- 版本 `3.0.0`。
- 样式进入 `dist/index.css`。
- 不新增 dependency / peerDependency。

## 15. 现有原型与本文的差异（实现待办）

| 原型现状 | v4 要求 |
|---|---|
| 数据源是 `spans` 树，带 token/cost/status | 只保留 `clips` / `tracks`，片段只有 `duration` |
| 顶部 7 项指标 + 图例 + 最慢排行 | 只保留当前时间 / 总时间 |
| `now` 实时游标 | 删除，统一用 `currentTime` |
| 无 `layout` | 增加 `lanes` / `sequence` |
| 无固定播放头 / 首行跟随 | 增加 `fixedPlayhead` / `playheadPosition` / `followMode` |
| 无时间格式 | 增加 `TimeFormat`，修正 `unitMs` 换算 |
| 搜索覆盖 span 字段 | 只匹配 `name` / `id` |
| 示例数据是 agent trace | 换成 `example/data.ts` 的歌词 + `order` / `characters` 歌手数据 |
| MVP 的 `lead` 只解决开头 | 增加右侧留白，保证固定播放头全程固定 |
| MVP 对视图外片段直接裁切 | 右侧正常渲染并压暗，左侧仍按 `viewStart` 裁切 |
