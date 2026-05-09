import { CSSProperties } from 'react'
import style from './vertical.module.scss'
import { PropsType, randomRGBColor } from './utils'

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
    const timeItems = items.map((item, index) => {
        let start: number;
        let end: number;

        if (Array.isArray(item.time)) {
            [start, end] = item.time;
        } else {
            start = item.time;
            if (index === items.length - 1) {
                end = totalTime;
            } else {
                const nextItem = items[index + 1];
                end = Array.isArray(nextItem.time) ? nextItem.time[0] : nextItem.time;
            }
        }
        return { ...item, start, end };
    }).filter(item => item.start >= 0);

    // 过滤出当前需要显示的元素：尚未结束的元素，或者在 prev 范围内的元素
    const activeItems = timeItems.filter((item, index) => {
        const nextItemToShow = timeItems[index + prev] || timeItems[timeItems.length - 1];
        return currentTime <= nextItemToShow.start;
    });

    return <div className={style.timeline} style={{ height }}>
        <div className={style['timeline-indicator']} {...indicator} style={{ left: `${left}%` }} />
        <div className={style['timeline-items']}
            style={{
                '--translate': `${left - ((currentTime / totalTime) * scale * 100)}%`
            } as CSSProperties}
        >
            {activeItems.map((item, index) => {
                const itemWidth = ((item.end - item.start) / totalTime) * scale * 100 + '%';
                const itemLeft = (item.start / totalTime) * scale * 100 + '%';

                return <div key={item.start + index} className={style['timeline-item']} style={{
                    '--bg': item.style?.background || colors[index % 20],
                    width: itemWidth,
                    left: itemLeft,
                    top: `${index * 35}px`, // 垂直时间轴不受 Level 影响，始终使用 index 实现自动补位
                    position: 'absolute',
                    ...itemStyle,
                    ...item.style
                } as CSSProperties}>
                    {item.content}
                </div>
            })}
        </div>
    </div>
}