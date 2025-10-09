import { CSSProperties, HTMLAttributes, ReactNode, useRef } from 'react'
import style from './index.module.scss'
import { getDuration, randomRGBColor } from './utils'
export interface itemsType {
    time: number,
    style?: CSSProperties
    content?: ReactNode
}

export default function Component({
    items, currentTime, totalTime, scale = 1, indicator
}: {
    items: itemsType[],
    currentTime: number
    totalTime: number,
    scale?: number
    indicator?: HTMLAttributes<HTMLDivElement>
}) {
    const colors = useRef(new Array(items.length).fill(0).map(randomRGBColor))

    return <div className={style.timeline}>
        <div className={style['timeline-indicator']} {...indicator}></div>
        <div className={style['timeline-items']}
            style={{
                '--translate': `${scale * 50 / scale - ((currentTime / totalTime) * scale * 100)}%`
            } as CSSProperties}
        >
            {items.map((item, index) => {
                const timeArray = items.map(item => item.time);
                const itemDuration = getDuration(timeArray, index);
                const width = (itemDuration / totalTime) * scale * 100 + '%';

                return <span className={style['timeline-item']} style={{
                    '--bg': item.style?.background || colors.current[index],
                    width,
                } as CSSProperties} >
                    {item.content}
                </span>
            })}
        </div>
    </div>
}