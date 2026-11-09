import {
    MouseEvent as ReactMouseEvent,
    ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react'
import styleSheet from './waterfall.module.scss'

// CSS Modules 在测试环境可能被替换成空对象，包一层避免 className={undefined}
const styleTarget = (typeof styleSheet === 'object' && styleSheet
    ? styleSheet
    : {}) as Record<string, string>
const style = new Proxy(styleTarget, {
    get(target, key) {
        return typeof key === 'string' ? (target[key] ?? '') : undefined
    }
})
import {
    buildRows,
    buildTicks,
    clampTime,
    DEFAULT_LABELS,
    formatDuration,
    formatTime,
    getActiveAt,
    getClipEnd,
    getTopActiveAt,
    matchClip,
    resolveRange,
    ZOOM_LEVELS
} from './waterfall'
import type {
    TimelineClip,
    TimelineRow,
    TraceWaterfallProps
} from './waterfall'

function cx(...names: Array<string | false | null | undefined>) {
    return names.filter(Boolean).join(' ')
}

function paletteColor(index: number) {
    const normalized = ((index % 6) + 6) % 6
    return `var(--wf-clip-${normalized + 1})`
}

/** 根据背景色选择可读的文字颜色；CSS 变量交给样式表处理 */
function textColor(background?: string) {
    if (!background) return undefined
    const hex = background.trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined

    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14161c' : '#ffffff'
}

/** 高亮搜索命中的第一段文本 */
function highlight(text: string, query: string): ReactNode {
    const keyword = query.trim()
    if (!keyword) return text

    const index = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (index < 0) return text

    return <>
        {text.slice(0, index)}
        <mark className={style.mark}>{text.slice(index, index + keyword.length)}</mark>
        {text.slice(index + keyword.length)}
    </>
}

interface DetailState {
    clip: TimelineClip,
    x: number,
    y: number
}

export default function TraceWaterfall({
    clips,
    tracks,
    layout = 'lanes',
    unit = 's',
    viewStart,
    viewDuration,
    currentTime,
    onCurrentTimeChange,
    formatTime: formatTimeProp,
    formatDuration: formatDurationProp,
    fixedPlayhead = false,
    playheadPosition = 0.5,
    followMode = 'off',
    zoom,
    defaultZoom = 1,
    onZoomChange,
    labelWidth = 220,
    height = 360,
    minTickGap = 64,
    showTime = true,
    showDetail = true,
    showSearch = true,
    showZoom = true,
    emptyText,
    labels,
    onClipClick,
    className,
    style: rootStyle
}: TraceWaterfallProps) {
    const rootRef = useRef<HTMLDivElement>(null)
    const scrollerRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const hoveredRef = useRef(false)
    const initialZoom = typeof zoom === 'number' && zoom > 0
        ? zoom
        : (defaultZoom > 0 ? defaultZoom : 1)
    const prevZoomRef = useRef<number>(initialZoom)

    const [query, setQuery] = useState('')
    const [innerZoom, setInnerZoom] = useState(defaultZoom)
    const [viewportWidth, setViewportWidth] = useState(0)
    const [detail, setDetail] = useState<DetailState | null>(null)

    const mergedLabels = useMemo(
        () => ({ ...DEFAULT_LABELS, ...labels }),
        [labels]
    )
    const rawZoom = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : innerZoom
    const currentZoom = rawZoom > 0 ? rawZoom : 1
    const effectiveLayout = followMode !== 'off' ? 'sequence' : layout
    const range = useMemo(
        () => resolveRange(clips, viewStart, viewDuration),
        [clips, viewStart, viewDuration]
    )

    const displayDuration = range.duration
    const geometryDuration = Math.max(displayDuration, 1)
    const trackWidth = Math.max(viewportWidth - labelWidth, 320)
    const pxPerUnit = (trackWidth / geometryDuration) * currentZoom
    const viewWidth = displayDuration * pxPerUnit
    const position = Math.min(Math.max(
        Number.isFinite(playheadPosition) ? playheadPosition : 0.5,
        0
    ), 1)
    const lead = fixedPlayhead ? trackWidth * position : 0
    const maxClipEnd = useMemo(
        () => clips.reduce((max, clip) => {
            const end = getClipEnd(clip)
            return Number.isFinite(end) ? Math.max(max, end) : max
        }, range.end),
        [clips, range.end]
    )
    const renderEnd = Math.max(range.end, maxClipEnd)
    const bodyWidth = Math.max(renderEnd - range.start, 0) * pxPerUnit
    const dimWidth = Math.max(bodyWidth - viewWidth, 0)
    const rightPad = fixedPlayhead
        ? Math.max(0, trackWidth * (1 - position) - dimWidth)
        : 0
    const canvasWidth = labelWidth + lead + bodyWidth + rightPad

    const clampedTime = typeof currentTime === 'number' && Number.isFinite(currentTime)
        ? clampTime(currentTime, range)
        : undefined

    const formatTimeValue = useCallback(
        (value: number) => formatTime(value, formatTimeProp, unit),
        [formatTimeProp, unit]
    )
    const formatDurationValue = useCallback(
        (value: number) => formatDurationProp
            ? formatDurationProp(value)
            : formatDuration(value, formatTimeProp, unit),
        [formatDurationProp, formatTimeProp, unit]
    )

    const rows = useMemo(
        () => buildRows(clips, tracks, effectiveLayout, mergedLabels),
        [clips, tracks, effectiveLayout, mergedLabels]
    )
    const visibleRows = useMemo(() => {
        if (!query.trim()) return rows
        return rows
            .map(row => ({
                ...row,
                clips: row.clips.filter(clip => matchClip(clip, query))
            }))
            .filter(row => row.clips.length > 0)
    }, [rows, query])

    const activeSet = useMemo(() => {
        if (clampedTime === undefined) return new Set<TimelineClip>()
        return new Set(getActiveAt(clips, clampedTime, range))
    }, [clips, clampedTime, range])

    const { step, ticks, firstOffset } = useMemo(
        () => buildTicks(range, pxPerUnit, minTickGap),
        [range, pxPerUnit, minTickGap]
    )
    const gridSize = Math.max(step * pxPerUnit, 1)

    // 容器宽度测量，用于把时间轴铺满视口
    useEffect(() => {
        const element = scrollerRef.current
        if (!element) return

        const update = () => setViewportWidth(element.clientWidth)
        update()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', update)
            return () => window.removeEventListener('resize', update)
        }

        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    // 隐藏搜索时清空过滤，避免留下不可见的过滤条件
    useEffect(() => {
        if (!showSearch) setQuery('')
    }, [showSearch])

    // 组件内 ⌘F / Ctrl+F 聚焦搜索；隐藏搜索时不接管快捷键
    useEffect(() => {
        if (!showSearch) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
            const root = rootRef.current
            if (!root) return
            if (!hoveredRef.current && !root.contains(document.activeElement)) return
            event.preventDefault()
            searchRef.current?.focus()
            searchRef.current?.select()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [showSearch])

    // 详情浮层：点击外部或 Esc 关闭
    useEffect(() => {
        if (!detail) return

        const onPointerDown = (event: MouseEvent) => {
            const element = popoverRef.current
            if (element && event.target instanceof Node && element.contains(event.target)) return
            setDetail(null)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setDetail(null)
        }

        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [detail])

    // 缩放时保持视口中心时间不漂移；固定播放头则重新贴住游标
    useLayoutEffect(() => {
        const element = scrollerRef.current
        const previous = prevZoomRef.current
        if (!element || previous === currentZoom) return

        const previousPx = (trackWidth / geometryDuration) * previous
        if (fixedPlayhead) {
            const time = clampTime(clampedTime ?? range.start, range)
            element.scrollLeft = Math.max(0, (time - range.start) * pxPerUnit)
        } else if (previousPx > 0) {
            const centerTime = clampTime(
                range.start + (element.scrollLeft + element.clientWidth / 2 - labelWidth - lead) / previousPx,
                range
            )
            element.scrollLeft = Math.max(
                0,
                labelWidth + lead + (centerTime - range.start) * pxPerUnit - element.clientWidth / 2
            )
        }

        prevZoomRef.current = currentZoom
    }, [
        currentZoom,
        trackWidth,
        geometryDuration,
        fixedPlayhead,
        clampedTime,
        range,
        pxPerUnit,
        labelWidth,
        lead
    ])

    // 固定播放头：内容按 currentTime 平移，游标停在 playheadPosition
    useLayoutEffect(() => {
        if (!fixedPlayhead) return
        const element = scrollerRef.current
        if (!element) return

        const time = clampTime(clampedTime ?? range.start, range)
        element.scrollLeft = Math.max(0, (time - range.start) * pxPerUnit)
    }, [fixedPlayhead, clampedTime, range, pxPerUnit])

    // 首行跟随：只在平铺布局生效
    useLayoutEffect(() => {
        if (followMode === 'off' || effectiveLayout !== 'sequence') return
        const element = scrollerRef.current
        if (!element || clampedTime === undefined) return

        if (followMode === 'hide') {
            element.scrollTop = 0
            return
        }

        const rowElements = element.querySelectorAll<HTMLElement>('[data-wf="row"]')
        if (!rowElements.length) return

        let target = -1
        for (let i = 0; i < visibleRows.length; i++) {
            const row = visibleRows[i]
            if (row.start <= clampedTime && clampedTime <= row.end) {
                target = i
                break
            }
        }
        if (target < 0) {
            for (let i = 0; i < visibleRows.length; i++) {
                if (visibleRows[i].end >= clampedTime) {
                    target = i
                    break
                }
            }
        }
        if (target < 0) return

        const rowHeight = rowElements[0].getBoundingClientRect().height || 32
        element.scrollTop = target * rowHeight
    }, [followMode, effectiveLayout, clampedTime, visibleRows])

    const applyZoom = (value: number) => {
        if (zoom === undefined) setInnerZoom(value)
        onZoomChange?.(value)
    }

    const openDetail = (clip: TimelineClip, event: { clientX: number, clientY: number }) => {
        onClipClick?.(clip)
        if (!showDetail) return
        setDetail({ clip, x: event.clientX, y: event.clientY })
    }

    const handleRulerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!onCurrentTimeChange || !Number.isFinite(pxPerUnit) || pxPerUnit <= 0) return
        if (event.clientX < labelWidth) return

        const rect = event.currentTarget.getBoundingClientRect()
        const time = range.start + (event.clientX - rect.left) / pxPerUnit
        onCurrentTimeChange(clampTime(time, range))
    }

    const handleLabelClick = (row: TimelineRow, event: ReactMouseEvent<HTMLDivElement>) => {
        if (!row.clips.length) return
        const time = clampedTime ?? range.start
        const topActive = getTopActiveAt(row.clips, time, range)[0]
        const clip = effectiveLayout === 'sequence'
            ? row.clips[0]
            : (topActive ?? row.clips[0])
        openDetail(clip, event)
    }

    const renderSearchText = (text: string, clip?: TimelineClip): ReactNode => {
        const keyword = query.trim()
        if (!keyword) return text
        if (text.toLowerCase().includes(keyword.toLowerCase())) return highlight(text, query)
        if (clip && clip.id.toLowerCase().includes(keyword.toLowerCase())) {
            return <>
                {text} <span className={style.idTag}>#{highlight(clip.id, query)}</span>
            </>
        }
        return text
    }

    const renderClipText = (clip: TimelineClip): ReactNode => {
        if (clip.label !== undefined) return clip.label
        return renderSearchText(clip.name ?? clip.id, clip)
    }

    const renderBar = (clip: TimelineClip, key: string) => {
        const end = getClipEnd(clip)
        if (!Number.isFinite(clip.start) || !Number.isFinite(end) || end < range.start) return null

        const start = Math.max(clip.start, range.start)
        const left = (start - range.start) * pxPerUnit
        const width = Math.max((end - start) * pxPerUnit, 2)
        const name = clip.name ?? clip.id
        const durationText = formatDurationValue(end - clip.start)

        return <button
            type="button"
            key={key}
            data-wf="bar"
            data-clip-id={clip.id}
            className={cx(style.bar, activeSet.has(clip) && style.barActive)}
            style={{
                left,
                width,
                background: clip.color ?? paletteColor(clip.index),
                color: textColor(clip.color),
                ...clip.style
            }}
            title={`${name} · ${durationText}`}
            aria-label={`${name} ${durationText}`}
            onClick={event => openDetail(clip, event)}
        >
            {width > 60 && <span className={style.barText}>{renderClipText(clip)}</span>}
        </button>
    }

    const hideBefore = followMode === 'hide' && effectiveLayout === 'sequence'
        ? clampedTime
        : undefined
    const hasClips = clips.length > 0
    const emptyMessage = !hasClips
        ? (emptyText ?? mergedLabels.empty)
        : query.trim()
            ? mergedLabels.noMatch(query)
            : (emptyText ?? mergedLabels.empty)
    const showEmptyState = !hasClips || visibleRows.length === 0

    const popoverWidth = 300
    const viewportW = typeof window === 'undefined' ? 1024 : window.innerWidth
    const viewportH = typeof window === 'undefined' ? 768 : window.innerHeight
    const popoverX = detail
        ? Math.max(12, Math.min(detail.x + 12, viewportW - popoverWidth - 12))
        : 0
    const popoverY = detail
        ? Math.max(12, Math.min(detail.y + 12, viewportH - 240))
        : 0

    let metaText = ''
    if (detail?.clip.meta) {
        try {
            metaText = JSON.stringify(detail.clip.meta, null, 2)
        } catch {
            metaText = '[无法序列化的数据]'
        }
    }

    const detailTrack = detail
        ? tracks?.find(track => track.index === detail.clip.index)
        : undefined
    const detailTrackName = detail
        ? (detailTrack?.name ?? `${mergedLabels.track} ${detail.clip.index}`)
        : ''

    return <div
        ref={rootRef}
        className={cx(style.waterfall, className)}
        style={rootStyle}
        onMouseEnter={() => { hoveredRef.current = true }}
        onMouseLeave={() => { hoveredRef.current = false }}
    >
        {showTime && <div className={style.timebar}>
            <span className={style.timeItem} data-wf="current-time">
                {mergedLabels.current}：<b>{clampedTime === undefined ? '-' : formatTimeValue(clampedTime)}</b>
            </span>
            <span className={style.timeItem} data-wf="total-time">
                {mergedLabels.total}：<b>{formatDurationValue(displayDuration)}</b>
            </span>
        </div>}

        {(showSearch || showZoom) && <div className={style.toolbar}>
            {showSearch && <div className={style.search}>
                <input
                    ref={searchRef}
                    data-wf="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={mergedLabels.search}
                    aria-label={mergedLabels.search}
                />
                <kbd>⌘F</kbd>
            </div>}

            {showZoom && <div className={style.zoom} role="group" aria-label={mergedLabels.zoom} data-wf="zoom">
                {ZOOM_LEVELS.map(level => <button
                    type="button"
                    key={level}
                    data-zoom={level}
                    className={cx(style.zoomItem, level === currentZoom && style.zoomActive)}
                    aria-pressed={level === currentZoom}
                    onClick={() => applyZoom(level)}
                >
                    {level}x
                </button>)}
            </div>}
        </div>}

        <div
            ref={scrollerRef}
            className={style.scroller}
            style={{ height }}
            data-wf="scroller"
            data-wf-layout={effectiveLayout}
        >
            <div
                className={style.canvas}
                data-wf="canvas"
                style={{ width: canvasWidth }}
            >
                <div className={style.ruler} data-wf="ruler">
                    <div
                        className={style.rulerLabel}
                        data-wf="ruler-label"
                        style={{ width: labelWidth }}
                    >
                        {effectiveLayout === 'lanes'
                            ? mergedLabels.lanesColumn
                            : mergedLabels.sequenceColumn}
                    </div>
                    <div
                        className={style.rulerTrack}
                        data-wf="ruler-track"
                        style={{ width: bodyWidth, marginLeft: lead }}
                        onClick={handleRulerClick}
                    >
                        {ticks.map(tick => <span
                            key={tick.value}
                            className={style.tick}
                            style={{ left: tick.x }}
                        >
                            {formatTimeValue(tick.value)}
                        </span>)}
                        {dimWidth > 0 && <span
                            className={style.rulerDim}
                            style={{ left: viewWidth, width: dimWidth }}
                        />}
                    </div>
                </div>

                {bodyWidth > 0 && <div
                    className={style.grid}
                    style={{
                        left: labelWidth + lead,
                        width: bodyWidth,
                        backgroundSize: `${gridSize}px 100%`,
                        backgroundPositionX: firstOffset
                    }}
                />}

                {!showEmptyState ? <div className={style.rows}>
                    {visibleRows.map(row => <div
                        key={row.id}
                        className={style.row}
                        data-wf="row"
                        data-start={row.start}
                        data-end={row.end}
                        style={hideBefore !== undefined && row.end < hideBefore
                            ? { display: 'none' }
                            : undefined}
                    >
                        <div
                            className={style.label}
                            style={{ width: labelWidth }}
                            title={row.label}
                            onClick={event => handleLabelClick(row, event)}
                        >
                            <span
                                className={style.dot}
                                style={{
                                    background: row.clips[0]?.color ?? paletteColor(row.index)
                                }}
                            />
                            <span className={style.name}>
                                {effectiveLayout === 'sequence'
                                    ? renderSearchText(row.label, row.clips[0])
                                    : renderSearchText(row.label)}
                            </span>
                            {effectiveLayout === 'sequence' && <span
                                className={style.tag}
                                title={row.trackName}
                            >
                                {row.trackName}
                            </span>}
                            {effectiveLayout === 'sequence' && <span className={style.duration}>
                                {formatDurationValue(row.end - row.start)}
                            </span>}
                        </div>

                        <div
                            className={style.track}
                            style={{ width: bodyWidth, marginLeft: lead }}
                        >
                            {row.clips.map((clip, index) => renderBar(clip, `${row.id}-${index}`))}
                        </div>
                    </div>)}
                </div> : <div className={style.empty} data-wf="empty">
                    {emptyMessage}
                </div>}

                {dimWidth > 0 && <div
                    className={style.dim}
                    data-wf="dim"
                    style={{ left: labelWidth + lead + viewWidth, width: dimWidth }}
                />}

                {clampedTime !== undefined && <div
                    className={style.cursor}
                    data-wf="cursor"
                    style={{ left: labelWidth + lead + (clampedTime - range.start) * pxPerUnit }}
                />}
            </div>
        </div>

        {showDetail && detail && <div
            ref={popoverRef}
            className={style.popover}
            data-wf="detail"
            style={{ left: popoverX, top: popoverY }}
            role="dialog"
            aria-label={detail.clip.name ?? detail.clip.id}
        >
            <div className={style.popoverHead}>
                <span
                    className={style.dot}
                    style={{
                        background: detail.clip.color ?? paletteColor(detail.clip.index)
                    }}
                />
                <strong title={detail.clip.name ?? detail.clip.id}>
                    {detail.clip.name ?? detail.clip.id}
                </strong>
                <button
                    type="button"
                    className={style.close}
                    aria-label={mergedLabels.close}
                    onClick={() => setDetail(null)}
                >
                    ×
                </button>
            </div>

            <dl className={style.kv}>
                <dt>{mergedLabels.track}</dt>
                <dd>{detail.clip.index} · {detailTrackName}</dd>
                <dt>{mergedLabels.start}</dt>
                <dd>{formatTimeValue(detail.clip.start)}</dd>
                <dt>{mergedLabels.end}</dt>
                <dd>{formatTimeValue(getClipEnd(detail.clip))}</dd>
                <dt>{mergedLabels.duration}</dt>
                <dd>{formatDurationValue(getClipEnd(detail.clip) - detail.clip.start)}</dd>
            </dl>

            {metaText && <pre className={style.raw}>{metaText}</pre>}
        </div>}
    </div>
}
