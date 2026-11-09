import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import Component from '../packages/Component'
import Vertical from '../packages/Vertical'
import { TraceWaterfall } from '../packages'
import type { TimeFormat, TimelineClip, TimelineTrack } from '../packages'
import { characters, data as lyricData, order } from './data'
import './index.scss'

const FORMATS: Array<{ value: string, label: string, format: TimeFormat }> = [
    {
        value: 'clock',
        label: '00:00:01.000',
        format: { type: 'clock', millisecond: true }
    },
    {
        value: 'number',
        label: '纯数字',
        format: { type: 'number' }
    },
    {
        value: 'smpte',
        label: 'SMPTE 25fps',
        format: { type: 'smpte', fps: 25, offset: 36000 }
    }
]

const VIEW_OPTIONS = [
    { value: 0, label: '全曲' },
    { value: 60, label: '60s' },
    { value: 120, label: '120s' },
    { value: 180, label: '180s' }
]

const ZOOM_STEPS = [0.5, 1, 1.5, 2, 4, 8, 16]

function nextZoom(current: number, direction: 1 | -1) {
    const index = ZOOM_STEPS.indexOf(current)
    const start = index >= 0 ? index : ZOOM_STEPS.indexOf(1.5)
    const next = Math.min(Math.max(start + direction, 0), ZOOM_STEPS.length - 1)
    return ZOOM_STEPS[next]
}

const SINGER_TRACKS: TimelineTrack[] = characters.map((character, index) => ({
    index,
    name: character.name
}))

const controlsStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    margin: '10px 0'
}

const labelStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: '#555'
}

const buttonStyle: CSSProperties = {
    padding: '4px 12px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    background: '#fff',
    color: '#1f2430',
    cursor: 'pointer'
}

const sectionStyle: CSSProperties = {
    marginTop: 28
}

const hintStyle: CSSProperties = {
    margin: '0 0 8px',
    color: '#666'
}

export default function App() {
    const audioRef = useRef<HTMLAudioElement>(null)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [vertical, setVertical] = useState(false)
    const [showOld, setShowOld] = useState(false)
    const [layout, setLayout] = useState<'lanes' | 'sequence'>('sequence')
    const [viewDuration, setViewDuration] = useState(0)
    const [zoom, setZoom] = useState(10)
    const [format, setFormat] = useState('clock')
    const [fixedPlayhead, setFixedPlayhead] = useState(true)
    const [playheadPosition, setPlayheadPosition] = useState(0.3)
    const [followMode, setFollowMode] = useState<'off' | 'scroll' | 'hide'>('hide')
    const [keepRowsAbove, setKeepRowsAbove] = useState(1)
    const [resizableLabel, setResizableLabel] = useState(true)
    const [labelWidth, setLabelWidth] = useState(220)
    const [rowHeight, setRowHeight] = useState<number | undefined>(undefined)
    const [rowGap, setRowGap] = useState(0)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        let rafId: number | null = null
        let lastTime = -1

        const sync = () => {
            const time = audio.currentTime
            if (time !== lastTime) {
                lastTime = time
                setCurrentTime(time)
            }
        }

        const loop = () => {
            sync()
            rafId = requestAnimationFrame(loop)
        }

        const start = () => {
            setPlaying(true)
            if (rafId !== null) return
            sync()
            rafId = requestAnimationFrame(loop)
        }

        const stop = () => {
            setPlaying(false)
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            sync()
        }

        const onDurationChange = () => setDuration(
            Number.isFinite(audio.duration) ? audio.duration : 0
        )

        audio.addEventListener('play', start)
        audio.addEventListener('pause', stop)
        audio.addEventListener('ended', stop)
        audio.addEventListener('seeking', sync)
        audio.addEventListener('seeked', sync)
        audio.addEventListener('loadedmetadata', onDurationChange)
        audio.addEventListener('durationchange', onDurationChange)

        onDurationChange()
        sync()
        if (!audio.paused) start()

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            audio.removeEventListener('play', start)
            audio.removeEventListener('pause', stop)
            audio.removeEventListener('ended', stop)
            audio.removeEventListener('seeking', sync)
            audio.removeEventListener('seeked', sync)
            audio.removeEventListener('loadedmetadata', onDurationChange)
            audio.removeEventListener('durationchange', onDurationChange)
        }
    }, [])

    const lyricMeta = useMemo(() => lyricData.map((item, index) => {
        const start = Array.isArray(item.time) ? item.time[0] : item.time
        const explicitEnd = Array.isArray(item.time) ? item.time[1] : undefined
        const next = lyricData[index + 1]
        const nextStart = next
            ? (Array.isArray(next.time) ? next.time[0] : next.time)
            : void '我永远喜欢沃雅妮莎'

        return { item, index, start, explicitEnd, nextStart }
    }), [])

    const dataEnd = useMemo(() => {
        let end = 0

        lyricMeta.forEach(({ start, explicitEnd, nextStart }) => {
            end = Math.max(end, explicitEnd ?? nextStart ?? start)
        })
        order.forEach(entry => {
            end = Math.max(end, entry.time)
        })

        return end
    }, [lyricMeta])

    // 音频元数据加载后使用真实时长；否则用数据末尾兜底
    const total = Math.max(duration, dataEnd + 3, 1)

    const lyricClips = useMemo(() => {
        const laneEnds: number[] = []

        return lyricMeta.map<TimelineClip>(({ item, index, start, explicitEnd, nextStart }) => {
            const end = explicitEnd ?? nextStart ?? total
            let lane = 0
            while (laneEnds[lane] !== undefined && laneEnds[lane] > start + 1e-6) {
                lane += 1
            }
            laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, end)

            const text = typeof item.content === 'string' && item.content.trim()
                ? item.content.trim()
                : '间奏'

            return {
                id: `lyric-${index}`,
                name: text,
                index: lane,
                start,
                duration: Math.max(end - start, 0),
                meta: {
                    content: text,
                    level: item.level
                }
            }
        })
    }, [lyricMeta, total])

    const lyricTracks = useMemo<TimelineTrack[]>(() => {
        const count = lyricClips.reduce((max, clip) => Math.max(max, clip.index + 1), 0)
        return Array.from({ length: count }, (_, index) => ({
            index,
            name: `歌词 ${index + 1}`
        }))
    }, [lyricClips])

    // 歌手时间线：order 的每一项代表一个时间段，characters 表示该时间段内演唱的歌手
    const singerClips = useMemo(() => {
        const clips: TimelineClip[] = []

        order.forEach((entry, index) => {
            const start = entry.time
            const end = index + 1 < order.length ? order[index + 1].time : total
            if (end <= start) return

            entry.characters.forEach(charIndex => {
                const character = characters[charIndex]
                if (!character) return

                clips.push({
                    id: `singer-${index}-${charIndex}`,
                    name: character.name,
                    index: charIndex,
                    start,
                    duration: end - start,
                    color: character.color,
                    meta: {
                        cv: character.cv
                    }
                })
            })
        })

        return clips
    }, [total])

    const effectiveViewDuration = viewDuration === 0 ? total : viewDuration

    const seek = (time: number) => {
        setCurrentTime(time)
        const audio = audioRef.current
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            audio.currentTime = Math.min(Math.max(time, 0), audio.duration)
        }
    }

    const characterItems = useMemo(() => order.map(m => ({
        time: m.time,
        content: m.characters.length === characters.length
            ? '合唱'
            : m.characters.map(c => characters[c].cv).join(' '),
        style: {
            background: `linear-gradient(90deg, ${m.characters.map(c => characters[c].color).join(',')})`
        }
    })), [])

    const formatOption = FORMATS.find(item => item.value === format) ?? FORMATS[0]

    return <>
        <h2 style={{ marginBottom: 8 }}>歌词 / 歌手时间线</h2>

        <audio ref={audioRef} src='/index.mp3' controls style={{ width: '100%' }} />

        <div style={controlsStyle}>
            <label style={labelStyle}>
                布局
                <select
                    value={followMode !== 'off' ? 'sequence' : layout}
                    disabled={followMode !== 'off'}
                    title={followMode !== 'off' ? '开启首行跟随时强制平铺' : undefined}
                    onChange={event => setLayout(event.target.value as 'lanes' | 'sequence')}
                >
                    <option value='lanes'>多轨</option>
                    <option value='sequence'>平铺</option>
                </select>
            </label>

            <label style={labelStyle}>
                视图
                <select
                    value={viewDuration}
                    onChange={event => setViewDuration(Number(event.target.value))}
                >
                    {VIEW_OPTIONS.map(item => <option key={item.value} value={item.value}>
                        {item.label}
                    </option>)}
                </select>
            </label>

            <div style={labelStyle}>
                <span>缩放</span>
                <button
                    type='button'
                    style={{
                        ...buttonStyle,
                        opacity: zoom > ZOOM_STEPS[0] ? 1 : 0.45,
                        cursor: zoom > ZOOM_STEPS[0] ? 'pointer' : 'not-allowed'
                    }}
                    disabled={zoom <= ZOOM_STEPS[0]}
                    aria-label={`缩小，当前 ${zoom}x`}
                    title={`缩小（当前 ${zoom}x）`}
                    onClick={() => setZoom(current => nextZoom(current, -1))}
                >
                    缩小
                </button>
                <button
                    type='button'
                    style={{
                        ...buttonStyle,
                        opacity: zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 1 : 0.45,
                        cursor: zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 'pointer' : 'not-allowed'
                    }}
                    disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                    aria-label={`放大，当前 ${zoom}x`}
                    title={`放大（当前 ${zoom}x）`}
                    onClick={() => setZoom(current => nextZoom(current, 1))}
                >
                    放大
                </button>
            </div>

            <label style={labelStyle}>
                格式
                <select value={format} onChange={event => setFormat(event.target.value)}>
                    {FORMATS.map(item => <option key={item.value} value={item.value}>
                        {item.label}
                    </option>)}
                </select>
            </label>

            <label style={labelStyle}>
                <input
                    type='checkbox'
                    checked={fixedPlayhead}
                    onChange={event => setFixedPlayhead(event.target.checked)}
                />
                固定播放头
            </label>

            <label style={labelStyle}>
                位置
                <select
                    value={playheadPosition}
                    onChange={event => setPlayheadPosition(Number(event.target.value))}
                >
                    <option value={0.3}>30%</option>
                    <option value={0.5}>50%</option>
                    <option value={0.7}>70%</option>
                </select>
            </label>

            <label style={labelStyle}>
                首行跟随
                <select
                    value={followMode}
                    onChange={event => setFollowMode(event.target.value as 'off' | 'scroll' | 'hide')}
                >
                    <option value='off'>关闭</option>
                    <option value='scroll'>上滚</option>
                    <option value='hide'>直接消失</option>
                </select>
            </label>

            <label style={labelStyle}>
                上方保留
                <select
                    value={keepRowsAbove}
                    onChange={event => setKeepRowsAbove(Number(event.target.value))}
                >
                    {[0, 1, 2, 3].map(count => <option key={count} value={count}>
                        {count} 行
                    </option>)}
                </select>
            </label>

            <label style={labelStyle}>
                标签列
                <input
                    type='number'
                    min={120}
                    max={480}
                    step={20}
                    value={labelWidth}
                    style={{ width: 64 }}
                    onChange={event => setLabelWidth(
                        Math.min(Math.max(Number(event.target.value) || 120, 120), 480)
                    )}
                />
            </label>

            <label style={labelStyle}>
                行高
                <select
                    value={rowHeight ?? 0}
                    onChange={event => {
                        const value = Number(event.target.value)
                        setRowHeight(value > 0 ? value : undefined)
                    }}
                >
                    <option value={0}>默认</option>
                    <option value={28}>28px</option>
                    <option value={36}>36px</option>
                    <option value={44}>44px</option>
                </select>
            </label>

            <label style={labelStyle}>
                行间距
                <select
                    value={rowGap}
                    onChange={event => setRowGap(Number(event.target.value))}
                >
                    {[0, 4, 8, 12].map(gap => <option key={gap} value={gap}>
                        {gap}px
                    </option>)}
                </select>
            </label>

            <label style={labelStyle}>
                <input
                    type='checkbox'
                    checked={resizableLabel}
                    onChange={event => setResizableLabel(event.target.checked)}
                />
                拖拽侧栏
            </label>
        </div>

        <section style={sectionStyle}>
            <h3>歌词时间线</h3>
            <p style={hintStyle}>
                按 <code>data.ts</code> 的歌词构建，重叠的歌词行会自动分到不同轨道。
            </p>
            <TraceWaterfall
                clips={lyricClips}
                tracks={lyricTracks}
                layout={layout}
                unit='s'
                viewStart={0}
                viewDuration={effectiveViewDuration}
                currentTime={currentTime}
                onCurrentTimeChange={seek}
                formatTime={formatOption.format}
                fixedPlayhead={fixedPlayhead}
                playheadPosition={playheadPosition}
                playing={playing}
                followMode={followMode}
                keepRowsAbove={keepRowsAbove}
                zoom={zoom}
                labelWidth={labelWidth}
                resizableLabel={resizableLabel}
                onLabelWidthChange={setLabelWidth}
                rowHeight={rowHeight}
                rowGap={rowGap}
                showSearch={false}
                showZoom={false}
                height={420}
            />
        </section>

        <section style={sectionStyle}>
            <h3>歌手时间线</h3>
            <TraceWaterfall
                clips={singerClips}
                tracks={SINGER_TRACKS}
                layout={layout}
                unit='s'
                viewStart={0}
                viewDuration={effectiveViewDuration}
                currentTime={currentTime}
                onCurrentTimeChange={seek}
                formatTime={formatOption.format}
                fixedPlayhead={fixedPlayhead}
                playheadPosition={playheadPosition}
                playing={playing}
                followMode={followMode}
                keepRowsAbove={keepRowsAbove}
                zoom={zoom}
                labelWidth={labelWidth}
                resizableLabel={resizableLabel}
                onLabelWidthChange={setLabelWidth}
                rowHeight={rowHeight}
                rowGap={rowGap}
                showSearch={false}
                showZoom={false}
                showTime={false}
                height={360}
            />
        </section>

        <p style={hintStyle}>
            点击标尺定位 <code>currentTime</code>；点击片段只打开详情，不移动播放头。
            把视图调到 60s / 120s / 180s 可以看到超出部分压暗，游标仍停在视图终点。
            开启首行跟随后按时间平铺，已结束的行会上滚或消失，“上方保留”控制目标行上方留几行。
            拖动标签列右边缘可以调整宽度，也可以用“标签列”输入框直接定义。
            播放时固定播放头 / 首行跟随会锁定纵向滚动，暂停后恢复自由滚动。
            行高、行间距可整体调整；需要单独控制某个块的高度时用片段的 `height`。
        </p>

        <label style={{ ...labelStyle, marginTop: 16 }}>
            <input
                type='checkbox'
                checked={showOld}
                onChange={event => setShowOld(event.target.checked)}
            />
            显示旧时间轴 demo（Component / Vertical）
        </label>

        {showOld && <>
            <h3>水平时间线</h3>
            <Component
                items={lyricData}
                currentTime={currentTime}
                scale={30}
                totalTime={total}
            />
            <Component
                items={characterItems}
                currentTime={currentTime}
                scale={30}
                totalTime={total}
                itemStyle={{ color: 'white' }}
            />

            <label style={labelStyle}>
                <input
                    type='checkbox'
                    checked={vertical}
                    onChange={event => setVertical(event.target.checked)}
                />
                垂直时间线
            </label>
            {vertical && <Vertical
                left={20}
                items={lyricData}
                currentTime={currentTime}
                scale={30}
                totalTime={total}
            />}
        </>}
    </>
}
