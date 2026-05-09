import { CSSProperties } from 'react'
import style from './index.module.scss'
import { PropsType, randomRGBColor } from './utils'

const colors = new Array(20).fill(0).map(randomRGBColor);

export default function Component({
    items, currentTime, totalTime, scale = 1, indicator, itemStyle
}: PropsType) {
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

    // 计算层级（用于处理重叠）
    let maxLevel = 0;
    const itemsWithLevel: any[] = [];
    
    timeItems.forEach((item, index) => {
        let level: number;

        // 如果用户显式指定了 level，则优先使用用户指定的 level
        if (item.level !== undefined) {
            level = item.level;
        } else {
            level = 0;
            // 自动计算逻辑：找出所有与当前 item 时间重叠且已经分配了 level 的 items
            const overlappingItems = itemsWithLevel.filter(prev =>
                item.start < prev.end && item.end > prev.start
            );

            // 找到这些 overlappingItems 中已占用的 level
            const usedLevels = overlappingItems.map(p => p.level);

            // 找到最小的未被占用的 level
            while (usedLevels.includes(level)) {
                level++;
            }
        }

        if (level > maxLevel) maxLevel = level;
        itemsWithLevel.push({ ...item, level });
    });

    return <div className={style.timeline}>
        <div className={style['timeline-indicator']} {...indicator}></div>
        <div className={style['timeline-items']}
            style={{
                '--translate': `${50 - ((currentTime / totalTime) * scale * 100)}%`,
                height: `${(maxLevel + 1) * 40}px` // 动态计算总高度
            } as CSSProperties}
        >
            {itemsWithLevel.map((item, index) => {
                const width = ((item.end - item.start) / totalTime) * scale * 100 + '%';
                const left = (item.start / totalTime) * scale * 100 + '%';
                return <span key={index} className={style['timeline-item']} style={{
                    '--bg': item.style?.background || colors[index % 20],
                    width,
                    left,
                    top: `${item.level * 40}px`, // 重叠时垂直偏移，每一层 40px
                    position: 'absolute',
                    ...itemStyle,
                    ...item.style
                } as CSSProperties}>
                    {item.content}
                </span>
            })}
        </div>
    </div>
}