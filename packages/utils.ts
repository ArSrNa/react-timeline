import { CSSProperties, HTMLAttributes, ReactNode } from "react";

export function randomRGBColor() {
    var r = Math.floor(120 + Math.random() * 91);
    var g = Math.floor(120 + Math.random() * 91);
    var b = Math.floor(120 + Math.random() * 91);
    return `rgb(${r},${g},${b})`;
}

export function getDuration(timeline: number[], i: number) {
    if (i === timeline.length - 1) {
        return timeline[i] - timeline[i - 1];
    } else {
        return timeline[i + 1] - timeline[i];
    }
}

export function getPrevElement<T>(item: T[], i: number, number: number = 1): T {
    if (i - number <= 0) return item[0]
    else return item[i - number]
}


export function getNextElement<T>(item: T[], i: number, number: number = 1): T {
    if (i + number >= item.length) return item.at(-1)
    else return item[i + number]
}
export interface PropsType {
    /**时间轴 */
    items: itemsType[],
    /**时间轴样式 */
    itemStyle?: CSSProperties,
    /**当前时间点 */
    currentTime: number,
    /**总时长 */
    totalTime: number,
    /**缩放比例 */
    scale?: number,
    /**时间轴指示器属性 */
    indicator?: HTMLAttributes<HTMLDivElement>
}

export interface itemsType {
    /**时间点 */
    time: number,
    /**该点对应的样式 */
    style?: CSSProperties,
    /**该点对应的文字 */
    content?: ReactNode
}