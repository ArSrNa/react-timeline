import { CSSProperties, ReactNode } from 'react'

export interface TimelineClip {
    /** 唯一 id */
    id: string,
    /** 行标签与搜索文案，缺省用 id */
    name?: string,
    /** 轨道号，相同 index 即同一轨 */
    index: number,
    /** 开始时间 */
    start: number,
    /** 时长，唯一结束依据 */
    duration: number,
    /** 条形内自定义内容，缺省用 name */
    label?: ReactNode,
    /** 条形颜色，缺省按轨道取 --wf-clip-N */
    color?: string,
    /** 条形自定义样式 */
    style?: CSSProperties,
    /** 条形高度（px）；不超过行高减去上下留白，缺省自动铺满行高 */
    height?: number,
    /** 原始数据，详情中展示 */
    meta?: Record<string, unknown>
}

export interface TimelineTrack {
    /** 轨道号 */
    index: number,
    /** 轨道名 */
    name?: string,
    /** 该轨行高（px），缺省用 rowHeight 或 --wf-row-h */
    height?: number
}

export type TimeFormat =
    | { type: 'number' }
    | { type: 'clock', millisecond?: boolean, offset?: number }
    | { type: 'smpte', fps: number, offset?: number }

export interface TimelineRange {
    start: number,
    end: number,
    duration: number
}

export interface TimelineRow {
    id: string,
    index: number,
    trackName: string,
    label: string,
    start: number,
    end: number,
    /** 行高（px）；缺省时由 CSS 变量 --wf-row-h 决定 */
    height?: number,
    clips: TimelineClip[]
}

export interface TimelineLabels {
    search: string,
    noMatch: (query: string) => string,
    empty: string,
    current: string,
    total: string,
    track: string,
    start: string,
    end: string,
    duration: string,
    close: string,
    zoom: string,
    resize: string,
    lanesColumn: string,
    sequenceColumn: string
}

export interface TraceWaterfallProps {
    /** 数据 */
    clips: TimelineClip[],
    tracks?: TimelineTrack[],
    /** 行布局，默认 lanes；followMode 非 off 时强制 sequence */
    layout?: 'lanes' | 'sequence',

    /** 时间单位，默认 s */
    unit?: 'ms' | 's',
    viewStart?: number,
    viewDuration?: number,
    currentTime?: number,
    onCurrentTimeChange?: (time: number) => void,
    formatTime?: TimeFormat | ((value: number) => string),
    formatDuration?: (value: number) => string,

    /** 视口 */
    fixedPlayhead?: boolean,
    playheadPosition?: number,
    /** 播放状态，默认 false；播放中且开启固定播放头 / 首行跟随时锁定纵向滚动 */
    playing?: boolean,
    followMode?: 'off' | 'scroll' | 'hide',
    /** 跟随时目标行上方保留的行数，默认 0 */
    keepRowsAbove?: number,
    zoom?: number,
    defaultZoom?: number,
    onZoomChange?: (zoom: number) => void,

    /** 外观 */
    /** 左侧标签列宽度，默认 220；拖拽后以内部宽度为准，传入变化时重新同步 */
    labelWidth?: number,
    /** 是否允许拖拽调整左侧标签列宽度，默认 true */
    resizableLabel?: boolean,
    /** 标签列最小宽度，默认 120 */
    minLabelWidth?: number,
    /** 标签列最大宽度，默认 480 */
    maxLabelWidth?: number,
    /** 标签列宽度变化回调（拖拽或键盘调整时触发） */
    onLabelWidthChange?: (width: number) => void,
    /** 默认行高（px）；不传时由 --wf-row-h 决定，片段 / 轨道可单独覆盖 */
    rowHeight?: number,
    /** 行与行之间的纵向间距（px），默认 0 */
    rowGap?: number,
    height?: CSSProperties['height'],
    minTickGap?: number,
    showTime?: boolean,
    showDetail?: boolean,
    showSearch?: boolean,
    showZoom?: boolean,
    emptyText?: string,
    labels?: Partial<TimelineLabels>,
    onClipClick?: (clip: TimelineClip) => void,
    className?: string,
    style?: CSSProperties
}

export const DEFAULT_TIME_FORMAT: TimeFormat = { type: 'clock', millisecond: true }

export const ZOOM_LEVELS = [0.5, 1, 1.5, 2, 4, 8, 16]

export const DEFAULT_LABELS: TimelineLabels = {
    search: '搜索片段',
    noMatch: query => `没有匹配 “${query}” 的片段`,
    empty: '暂无时间线数据',
    current: '当前',
    total: '总',
    track: '轨道',
    start: '开始',
    end: '结束',
    duration: '时长',
    close: '关闭详情',
    zoom: '缩放',
    resize: '调整标签列宽度',
    lanesColumn: '轨道',
    sequenceColumn: '片段'
}

/** 片段结束时间；负时长按 0 处理 */
export function getClipEnd(clip: TimelineClip): number {
    const duration = Number.isFinite(clip.duration) ? Math.max(clip.duration, 0) : 0
    return clip.start + duration
}

/** 计算视图范围；空数据时回退到 0 */
export function resolveRange(
    clips: TimelineClip[],
    viewStart?: number,
    viewDuration?: number
): TimelineRange {
    const hasClips = clips.length > 0
    let minStart = 0
    let maxEnd = 0

    if (hasClips) {
        minStart = Infinity
        maxEnd = -Infinity
        clips.forEach(clip => {
            if (Number.isFinite(clip.start)) minStart = Math.min(minStart, clip.start)
            const end = getClipEnd(clip)
            if (Number.isFinite(end)) maxEnd = Math.max(maxEnd, end)
        })
        if (!Number.isFinite(minStart)) minStart = 0
        if (!Number.isFinite(maxEnd)) maxEnd = minStart
    }

    const start = typeof viewStart === 'number' && Number.isFinite(viewStart)
        ? viewStart
        : minStart
    const fallback = hasClips ? Math.max(maxEnd - start, 0) : 0
    const duration = typeof viewDuration === 'number' && Number.isFinite(viewDuration)
        ? Math.max(viewDuration, 0)
        : fallback

    return { start, end: start + duration, duration }
}

/** 把时间钳制到视图范围 */
export function clampTime(time: number, range: TimelineRange): number {
    if (!Number.isFinite(time)) return range.start
    return Math.min(Math.max(time, range.start), range.end)
}

/** 返回该时刻所有活跃片段（闭区间），保持声明顺序 */
export function getActiveAt(
    clips: TimelineClip[],
    time: number,
    range?: TimelineRange
): TimelineClip[] {
    const activeRange = range ?? resolveRange(clips)
    const value = clampTime(time, activeRange)

    return clips.filter(clip => {
        if (!Number.isFinite(clip.start)) return false
        return clip.start <= value && value <= getClipEnd(clip)
    })
}

/**
 * 返回每轨最上层的活跃片段，按轨道号升序。
 * 同轨重叠时取声明顺序中的最后一个。
 */
export function getTopActiveAt(
    clips: TimelineClip[],
    time: number,
    range?: TimelineRange
): TimelineClip[] {
    const active = getActiveAt(clips, time, range)
    const byTrack = new Map<number, TimelineClip>()

    active.forEach(clip => {
        byTrack.set(clip.index, clip)
    })

    return [...byTrack.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, clip]) => clip)
}

/** 搜索匹配 name 与 id，大小写不敏感 */
export function matchClip(clip: TimelineClip, query: string): boolean {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return (clip.name ?? '').toLowerCase().includes(keyword)
        || clip.id.toLowerCase().includes(keyword)
}

function trackName(
    track: TimelineTrack | undefined,
    index: number,
    labels: Pick<TimelineLabels, 'track'>
): string {
    return track?.name ?? `${labels.track} ${index}`
}

/** 行高只接受有限非负数 */
function normalizeHeight(value?: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return Math.max(value, 0)
}

/** 构建行：lanes 按轨道，sequence 按 start 平铺；行高只由轨道 / rowHeight 决定 */
export function buildRows(
    clips: TimelineClip[],
    tracks: TimelineTrack[] | undefined,
    layout: 'lanes' | 'sequence',
    labels: Pick<TimelineLabels, 'track'>,
    rowHeight?: number
): TimelineRow[] {
    const defaultHeight = normalizeHeight(rowHeight)

    if (layout === 'sequence') {
        return clips
            .map((clip, order) => ({ clip, order }))
            .sort((a, b) => (a.clip.start - b.clip.start) || (a.order - b.order))
            .map(({ clip, order }) => {
                const track = tracks?.find(item => item.index === clip.index)
                const name = trackName(track, clip.index, labels)
                return {
                    id: `clip-${clip.id}-${order}`,
                    index: clip.index,
                    trackName: name,
                    label: clip.name ?? clip.id,
                    start: clip.start,
                    end: getClipEnd(clip),
                    height: normalizeHeight(track?.height) ?? defaultHeight,
                    clips: [clip]
                }
            })
    }

    const trackMap = new Map<number, TimelineTrack | undefined>()
    tracks?.forEach(track => {
        if (!trackMap.has(track.index)) trackMap.set(track.index, track)
    })
    clips.forEach(clip => {
        if (!trackMap.has(clip.index)) trackMap.set(clip.index, undefined)
    })

    return [...trackMap.keys()]
        .sort((a, b) => a - b)
        .map(index => {
            const track = trackMap.get(index)
            const name = trackName(track, index, labels)
            const rowClips = clips.filter(clip => clip.index === index)
            const starts = rowClips.map(clip => clip.start).filter(Number.isFinite)
            const ends = rowClips.map(getClipEnd).filter(Number.isFinite)

            return {
                id: `track-${index}`,
                index,
                trackName: name,
                label: name,
                start: starts.length ? Math.min(...starts) : 0,
                end: ends.length ? Math.max(...ends) : 0,
                height: normalizeHeight(track?.height) ?? defaultHeight,
                clips: rowClips
            }
        })
}

/** 从 1 / 2 / 5 / 10 × 10^n 中选出不小于 min 的最小步长 */
export function niceStep(min: number): number {
    if (!Number.isFinite(min) || min <= 0) return 1
    const pow = Math.pow(10, Math.floor(Math.log10(min)))
    const candidates = [1, 2, 5, 10]

    for (let i = 0; i < candidates.length; i++) {
        const step = candidates[i] * pow
        if (step >= min) return step
    }

    return 10 * pow
}

/** 生成整数刻度；最多 500 个 */
export function buildTicks(
    range: TimelineRange,
    pxPerUnit: number,
    minGap = 64
): { step: number, ticks: Array<{ value: number, x: number }>, firstOffset: number } {
    const safePx = Number.isFinite(pxPerUnit) && pxPerUnit > 0 ? pxPerUnit : 1e-6
    const step = niceStep(minGap / safePx)
    const first = Math.ceil(range.start / step) * step
    const ticks: Array<{ value: number, x: number }> = []

    for (let i = 0; i < 500; i++) {
        const value = first + i * step
        if (value > range.end + step * 1e-6) break
        if (value < range.start - step * 1e-6) continue
        ticks.push({ value, x: (value - range.start) * safePx })
    }

    return {
        step,
        ticks,
        firstOffset: (first - range.start) * safePx
    }
}

function pad(value: number, length = 2): string {
    return String(Math.floor(Math.abs(value))).padStart(length, '0')
}

/** 纯数字格式固定 3 位小数，例如 1.5 → 1.500 */
function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '-'
    const text = value.toFixed(3)
    return text === '-0.000' ? '0.000' : text
}

function formatClock(
    value: number,
    millisecond: boolean,
    offset: number,
    unit: 'ms' | 's'
): string {
    if (!Number.isFinite(value)) return '-'

    const unitMs = unit === 'ms' ? 1 : 1000
    const safeOffset = Number.isFinite(offset) ? offset : 0
    const totalMs = Math.round((safeOffset + value) * unitMs)
    const negative = totalMs < 0
    const abs = Math.abs(totalMs)
    const hours = Math.floor(abs / 3600000)
    const minutes = Math.floor((abs % 3600000) / 60000)
    const seconds = Math.floor((abs % 60000) / 1000)
    const ms = abs % 1000

    let text = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    if (millisecond) text += `.${pad(ms, 3)}`
    return (negative ? '-' : '') + text
}

function formatSmpte(
    value: number,
    fps: number,
    offset: number,
    unit: 'ms' | 's'
): string {
    if (!Number.isFinite(value)) return '-'

    const safeFps = Number.isInteger(fps) && fps > 0 ? fps : 25
    const safeOffset = Number.isFinite(offset) ? offset : 0
    const unitMs = unit === 'ms' ? 1 : 1000
    const totalFrames = Math.round((safeOffset + value) * unitMs * safeFps / 1000)
    const negative = totalFrames < 0
    const abs = Math.abs(totalFrames)
    const frame = abs % safeFps
    const totalSeconds = Math.floor(abs / safeFps)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return `${negative ? '-' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`
}

/** 绝对时间格式化，会应用 offset */
export function formatTime(
    value: number,
    format: TimeFormat | ((value: number) => string) = DEFAULT_TIME_FORMAT,
    unit: 'ms' | 's' = 's'
): string {
    if (typeof format === 'function') return format(value)

    if (format.type === 'number') return formatNumber(value)
    if (format.type === 'clock') {
        return formatClock(value, format.millisecond !== false, format.offset ?? 0, unit)
    }
    return formatSmpte(value, format.fps, format.offset ?? 0, unit)
}

/** 时长格式化，不应用 offset */
export function formatDuration(
    value: number,
    format: TimeFormat | ((value: number) => string) = DEFAULT_TIME_FORMAT,
    unit: 'ms' | 's' = 's'
): string {
    if (typeof format === 'function') return format(value)

    if (format.type === 'number') return formatNumber(value)
    if (format.type === 'clock') {
        return formatClock(value, format.millisecond !== false, 0, unit)
    }
    return formatSmpte(value, format.fps, 0, unit)
}
