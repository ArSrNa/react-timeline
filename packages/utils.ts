export function randomRGBColor() {
    var r = Math.floor(156 + Math.random() * 100);
    var g = Math.floor(156 + Math.random() * 100);
    var b = Math.floor(156 + Math.random() * 100);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export function getDuration(timeline: number[], i: number) {
    if (i === timeline.length - 1) {
        return timeline[i] - timeline[i - 1];
    } else {
        return timeline[i + 1] - timeline[i];
    }
}