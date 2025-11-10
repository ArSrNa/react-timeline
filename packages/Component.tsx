import { CSSProperties } from 'react'
import style from './index.module.scss'
import { getDuration, PropsType, randomRGBColor } from './utils'

const colors = new Array(20).fill(0).map(randomRGBColor);

export default function Component({
    items, currentTime, totalTime, scale = 1, indicator, itemStyle
}: PropsType) {
    items = items.filter(f => f.time >= 0)
    const timeArray = items.map(m => m.time);
    return <div className={style.timeline}>
        <div className={style['timeline-indicator']} {...indicator}></div>
        <div className={style['timeline-items']}
            style={{
                '--translate': `${scale * 50 / scale - (((currentTime - 1) / totalTime) * scale * 100)}%`
            } as CSSProperties}
        >
            {items.map((item, index) => {
                const itemDuration = getDuration(timeArray, index);
                const width = (itemDuration / totalTime) * scale * 100 + '%';
                return <span className={style['timeline-item']} style={{
                    '--bg': item.style?.background || colors[index % 20],
                    width,
                    ...itemStyle
                } as CSSProperties}>
                    {item.content}
                </span>
            })}
        </div>
    </div>
}