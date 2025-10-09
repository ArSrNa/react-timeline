import { CSSProperties, HTMLAttributes, ReactNode, useEffect, useRef } from 'react'
import style from './index.module.scss'
import { getDuration, randomRGBColor } from './utils'
export interface itemsType {
    time: number,
    style?: CSSProperties
    content?: ReactNode
}

const colors = new Array(10).fill(0).map(randomRGBColor);

export default function Component({
    items, currentTime, totalTime, scale = 1, indicator, itemStyle
}: {
    items: itemsType[],
    itemStyle?: CSSProperties
    currentTime: number
    totalTime: number,
    scale?: number
    indicator?: HTMLAttributes<HTMLDivElement>
}) {

    const timeArray = items.map(m => m.time);
    return <div className={style.timeline}>
        <div className={style['timeline-indicator']} {...indicator}></div>
        <div className={style['timeline-items']}
            style={{
                '--translate': `${scale * 50 / scale - ((currentTime / totalTime) * scale * 100)}%`
            } as CSSProperties}
        >
            {items.map((item, index) => {
                const itemDuration = getDuration(timeArray, index);
                const width = (itemDuration / totalTime) * scale * 100 + '%';

                return <span className={style['timeline-item']} style={{
                    '--bg': item.style?.background || colors[index > 10 ? index % 10 : index],
                    width,
                    ...itemStyle
                } as CSSProperties} >
                    {item.content}
                </span>
            })}
        </div>
    </div>
}