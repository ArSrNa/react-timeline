import { CSSProperties, HTMLAttributes, ReactNode } from "react";

export function randomRGBColor() {
    var r = Math.floor(120 + Math.random() * 91);
    var g = Math.floor(120 + Math.random() * 91);
    var b = Math.floor(120 + Math.random() * 91);
    return `rgb(${r},${g},${b})`;
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
    /**时间点（自定义时间点，可以是毫秒也可以是秒，由时间轴totalTime控制） [起始,结束] 或 起始 */
    time: number[] | number,
    /**该点对应的样式 */
    style?: CSSProperties,
    /**该点对应的内容 */
    content?: ReactNode,
    /** 指定显示的层级，level 越大越靠下。如果不指定，则自动计算。 */
    level?: number
}