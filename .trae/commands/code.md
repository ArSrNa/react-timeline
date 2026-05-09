---
name: "code"
description: "实现的功能"
---

这是一个时间轴项目，用于展示时间轴上的事件。

# 时间轴内容数据

一个时间轴内容的类型如下

```typescript
interface itemsType {
    /**时间点（自定义时间点，可以是毫秒也可以是秒，由时间轴totalTime控制） [起始,结束] 或 起始 */
    time: [number, number] & number,
    /**该点对应的样式 */
    style?: CSSProperties,
    /**该点对应的内容 */
    content?: ReactNode
}
```

## 基本数据
而一条时间轴由多个时间轴内容组成，比如
```typescript
[{
    time:[0,1],
    content:'这是0到1秒显示的内容（1到2秒之间是空白的）'
},{
    time:[2,5],
    content:'这是2到5秒显示的内容'
},{
    time:[5,10],
    style:{ color: "red" }
    content:'这是5秒到10秒的红色内容'
}]
```

## time传入单个数字类型

```typescript
[{
    time:[0,1],
    content:'这是0到1秒显示的内容（1到5秒之间是空白的）'
},{
    time: 5,
    content:'这是第5秒到下一个时间点开始前显示的内容（time只传入了1个数字）'
},{
    time:[10,15],
    content:'这是10秒到15秒的红色内容'
}]
```

## 多个内容重叠

当出现多个时间轴时间重叠的时候，并排显示，显示的顺序根据参数level来确定，默认是0，如果发生重复了，没有设置的时候就按照默认的方式重叠，设置了，则根据level来确定显示顺序。

比如下面的代码，0-1秒和0-5秒重叠，所以并排显示在下面，5-15秒和1-2秒重叠，所以并排显示在下面。

```typescript
[{
    time:[0,1],
    content:'这是0到1秒显示的内容'
},{
    time: [0,5],
    content:'这是第0秒到5秒显示的内容（和0-1秒重叠，所以并排显示在下面）'
},{
    time:[5,15],
    content:'这是5秒到15秒的红色内容'
}]
```

## level
指定了level，则强制将这个时间元素往下level个展示， level越大，越往下展示。

**注意：垂直时间轴不受Level影响！！！**

```typescript
[{
    time:[0,1],
    content:'这是0到1秒显示的内容'
},{
    time: [0,5],
    content:'这是第0秒到5秒显示的内容（和0-1秒重叠，所以并排显示在下面）'
    level: 1 //这里设置level=1，则往下一个显示
},{
    time:[4,15],
    content:'这是4秒到15秒的红色内容',
    level: 0 //这里重叠了，但是level=0，则不做处理
}]
```


# 时间轴参数
```typescript
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
```


# 效果
此时需要一个Slider或者播放器类似组件控制，比如在时间轴上拖动指示器，可以控制当前时间点。

要平铺展现一条时间轴，类似下面这样
```
1       2     3    4    5
1-2s显..| 2-5s显示的内容...|
```

然后有一根竖线穿过当前时间点，展示当前时间点的内容。

比如现在是4s：

```
1       2     3    |4    5
1-2s显..| 2-5s显示的|内容...|
```

还可以调节时间轴缩放、时间轴总时间等参数。

# 垂直时间轴

不像水平时间轴那样平铺成一条，垂直时间轴是垂直展示的，每个时间轴内容占一行。一样是从右往左滚动。

时间轴距离左侧依然保持绝对位置，也就是左侧距离0秒的位置是绝对的

还可以设置垂直时间轴的缩放比例，类似普通时间轴。同时当时间轴过去左边几个元素后，前面的元素自动消失，后面的元素自动补位

垂直时间轴在普通时间轴上还需要设置下面的参数：

```ts
{
    /**保留前几个项目 */
    prev?: number
    /**距离左边距 */
    left?: number,
    /**总高度 */
    height?: CSSProperties['height']
}
```