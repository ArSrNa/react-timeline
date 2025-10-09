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
    items: itemsType[],
    itemStyle?: CSSProperties
    currentTime: number
    totalTime: number,
    scale?: number
    indicator?: HTMLAttributes<HTMLDivElement>
}

export interface itemsType {
    time: number,
    style?: CSSProperties
    content?: ReactNode
}