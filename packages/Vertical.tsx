import { CSSProperties } from 'react'
import style from './vertical.module.scss'
import { getDuration, getNextElement, getPrevElement, PropsType, randomRGBColor } from './utils'

const colors = new Array(20).fill(0).map(randomRGBColor);

export default function Component({
    items, currentTime, totalTime, scale = 1, indicator, itemStyle, prev = 2,
    height,
    left = 10
}: PropsType & {
    /**保留前几个项目 */
    prev?: number
    /**距离左边距 */
    left?: number,
    /**总高度 */
    height?: CSSProperties['height']
}) {

    const timeArray = items.map(m => m.time);
    return <div className={style.timeline} style={{ height }}>
        <div className={style['timeline-indicator']} {...indicator} style={{ left: `${left}%` }} />
        <div className={style['timeline-items']}
            style={{
                '--translate': `${scale * left / scale - ((currentTime / totalTime) * scale * 100)}%`
            } as CSSProperties}
        >
            {items.map((item, index) => {
                const itemDuration = getDuration(timeArray, index);
                const width = (itemDuration / totalTime) * scale * 100 + '%';
                const left = items.slice(0, index).reduce((sum, _, i) => {
                    const prevDuration = getDuration(timeArray, i);
                    return sum + (prevDuration / totalTime) * scale * 100;
                }, 0) + '%';

                if (currentTime <= getNextElement(items, index, prev).time)
                    return <div className={style['timeline-item']} style={{
                        '--bg': item.style?.background || colors[index % 20],
                        width,
                        left,
                        ...itemStyle
                    } as CSSProperties}>
                        {item.content}
                    </div>
            })}
        </div>
    </div>
}