import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  TraceWaterfall,
  formatDuration,
  formatTime,
  getActiveAt,
  getTopActiveAt,
  resolveRange,
} from "../packages";
import type { TimelineClip, TimelineTrack } from "../packages";

const A: TimelineClip = { id: "A", name: "A", index: 0, start: 0, duration: 1 };
const B: TimelineClip = { id: "B", name: "B", index: 1, start: 1, duration: 1 };
const C: TimelineClip = { id: "C", name: "C", index: 2, start: 1, duration: 2 };
const D: TimelineClip = { id: "D", name: "D", index: 0, start: 0, duration: 5 };
const E: TimelineClip = { id: "E", name: "E", index: 0, start: 2, duration: 1 };

const clips = [A, B, C, D, E];
const tracks: TimelineTrack[] = [
  { index: 0, name: "场景 1" },
  { index: 1, name: "场景 2" },
  { index: 2, name: "场景 3" },
];

function q<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element as T;
}

afterEach(cleanup);

describe("TraceWaterfall", () => {
  test("lanes 按轨道分行并显示轨道名", () => {
    const { container, getByText } = render(
      <TraceWaterfall clips={[A, B, C]} tracks={tracks} />
    );

    const rows = container.querySelectorAll('[data-wf="row"]');
    expect(rows.length).toBe(3);
    expect(getByText("场景 1")).toBeTruthy();
    expect(getByText("场景 2")).toBeTruthy();
    expect(getByText("场景 3")).toBeTruthy();
  });

  test("sequence 每个片段一行，按 start 升序", () => {
    const { container } = render(
      <TraceWaterfall clips={clips} tracks={tracks} layout="sequence" />
    );

    const rows = [...container.querySelectorAll('[data-wf="row"]')];
    expect(rows.length).toBe(5);
    expect(rows.map(row => row.getAttribute("data-start"))).toEqual([
      "0",
      "0",
      "1",
      "1",
      "2",
    ]);
  });

  test("缩放保持刻度一致，D 的宽度为 320 / 640 / 160", () => {
    const { container, getByText } = render(
      <TraceWaterfall clips={clips} tracks={tracks} />
    );
    const bar = () => q<HTMLElement>(container, '[data-clip-id="D"]');

    expect(bar().style.width).toBe("320px");

    fireEvent.click(getByText("2x"));
    expect(bar().style.width).toBe("640px");

    fireEvent.click(getByText("0.5x"));
    expect(bar().style.width).toBe("160px");
  });

  test("currentTime=0.5 时游标按公式定位", () => {
    const { container } = render(
      <TraceWaterfall clips={clips} tracks={tracks} currentTime={0.5} />
    );

    const cursor = q<HTMLElement>(container, '[data-wf="cursor"]');
    expect(cursor.style.left).toBe("252px");
  });

  test("getActiveAt 使用闭区间", () => {
    const activeClips = [A, B, C];
    const range = resolveRange(activeClips);

    expect(getActiveAt(activeClips, 0, range).map(clip => clip.id)).toEqual(["A"]);
    expect(getActiveAt(activeClips, 1, range).map(clip => clip.id)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(getActiveAt(activeClips, 2, range).map(clip => clip.id)).toEqual([
      "B",
      "C",
    ]);
    expect(getActiveAt(activeClips, 3, range).map(clip => clip.id)).toEqual(["C"]);
  });

  test("同轨重叠时后者绘制在上层，getTopActiveAt 取后者", () => {
    const { container } = render(
      <TraceWaterfall clips={[D, E]} tracks={tracks} />
    );

    const ids = [...container.querySelectorAll('[data-wf="bar"]')]
      .map(bar => bar.getAttribute("data-clip-id"));
    expect(ids).toEqual(["D", "E"]);
    expect(getTopActiveAt([D, E], 2).map(clip => clip.id)).toEqual(["E"]);
  });

  test("视图外片段正常渲染并压暗，currentTime 被钳制", () => {
    const { container } = render(
      <TraceWaterfall
        clips={[A, B, C]}
        tracks={tracks}
        viewDuration={1}
        currentTime={3}
      />
    );

    const c = q<HTMLElement>(container, '[data-clip-id="C"]');
    expect(c.style.left).toBe("320px");
    expect(c.style.width).toBe("640px");

    const dim = q<HTMLElement>(container, '[data-wf="dim"]');
    expect(dim.style.left).toBe("540px");
    expect(dim.style.width).toBe("640px");

    expect(q<HTMLElement>(container, '[data-wf="cursor"]').style.left).toBe("540px");
  });

  test("点击标尺按像素换算时间，压暗区钳制到 viewEnd", () => {
    const clip: TimelineClip = {
      id: "X",
      name: "X",
      index: 0,
      start: 10,
      duration: 5,
    };
    let seeked: number | undefined;
    const { container } = render(
      <TraceWaterfall
        clips={[clip]}
        viewStart={10}
        viewDuration={5}
        onCurrentTimeChange={value => { seeked = value; }}
      />
    );

    const ruler = q<HTMLElement>(container, '[data-wf="ruler-track"]');
    Object.defineProperty(ruler, "getBoundingClientRect", {
      value: () => ({
        left: 220,
        top: 0,
        right: 540,
        bottom: 30,
        width: 320,
        height: 30,
        x: 220,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(ruler, { clientX: 348 });
    expect(seeked).toBe(12);

    fireEvent.click(ruler, { clientX: 700 });
    expect(seeked).toBe(15);
  });

  test("点击片段只开详情，不 seek", () => {
    let clicked = 0;
    let seeked = 0;
    const { container } = render(
      <TraceWaterfall
        clips={[A]}
        currentTime={0}
        onClipClick={() => { clicked += 1; }}
        onCurrentTimeChange={() => { seeked += 1; }}
      />
    );

    fireEvent.click(q<HTMLElement>(container, '[data-clip-id="A"]'));

    expect(clicked).toBe(1);
    expect(seeked).toBe(0);
    expect(container.querySelector('[data-wf="detail"]')).toBeTruthy();
  });

  test("SMPTE / clock / number 换算正确", () => {
    expect(formatTime(0, { type: "smpte", fps: 25, offset: 36000 }, "s")).toBe(
      "10:00:00:00"
    );
    expect(formatDuration(0, { type: "smpte", fps: 25, offset: 36000 }, "s")).toBe(
      "00:00:00:00"
    );
    expect(formatTime(1000, { type: "clock", millisecond: true }, "ms")).toBe(
      "00:00:01.000"
    );
    expect(formatTime(1, { type: "clock", millisecond: true }, "s")).toBe(
      "00:00:01.000"
    );
    expect(formatTime(1.5, { type: "number" }, "s")).toBe("1.5");
    expect(formatTime(-1, { type: "clock", millisecond: true }, "s")).toBe(
      "-00:00:01.000"
    );
  });

  test("时间栏显示当前时间 / 总时间，无 currentTime 时显示 -", () => {
    const { container } = render(
      <TraceWaterfall clips={[A]} currentTime={0.5} />
    );
    expect(q<HTMLElement>(container, '[data-wf="current-time"]').textContent)
      .toContain("00:00:00.500");
    expect(q<HTMLElement>(container, '[data-wf="total-time"]').textContent)
      .toContain("00:00:01.000");

    const { container: second } = render(<TraceWaterfall clips={[A]} />);
    expect(q<HTMLElement>(second, '[data-wf="current-time"]').textContent)
      .toContain("-");
  });

  test("固定播放头加 lead 与右侧留白，起点终点都固定", () => {
    const { container, rerender } = render(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        fixedPlayhead
        currentTime={0}
      />
    );

    const scroller = q<HTMLElement>(container, '[data-wf="scroller"]');
    const cursorLeft = () => q<HTMLElement>(container, '[data-wf="cursor"]').style.left;

    expect(scroller.scrollLeft).toBe(0);
    expect(cursorLeft()).toBe("380px");

    rerender(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        fixedPlayhead
        currentTime={5}
      />
    );
    expect(scroller.scrollLeft).toBe(320);
    expect(cursorLeft()).toBe("700px");
  });

  test("关闭固定播放头后不主动改写 scrollLeft", () => {
    const { container, rerender } = render(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        fixedPlayhead={false}
        currentTime={5}
      />
    );

    const scroller = q<HTMLElement>(container, '[data-wf="scroller"]');
    scroller.scrollLeft = 40;

    rerender(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        fixedPlayhead={false}
        currentTime={2}
      />
    );

    expect(scroller.scrollLeft).toBe(40);
  });

  test("followMode 非 off 时强制平铺，并滚动 / 隐藏行", () => {
    const { container, rerender } = render(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        layout="lanes"
        followMode="scroll"
        currentTime={2.5}
      />
    );

    const scroller = q<HTMLElement>(container, '[data-wf="scroller"]');
    expect(scroller.getAttribute("data-wf-layout")).toBe("sequence");
    expect(scroller.scrollTop).toBe(32);

    rerender(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        layout="lanes"
        followMode="hide"
        currentTime={2.5}
      />
    );

    const rows = [...container.querySelectorAll('[data-wf="row"]')] as HTMLElement[];
    expect(rows[0].style.display).toBe("none");
    expect(rows[2].style.display).toBe("none");
    expect(scroller.scrollTop).toBe(0);

    rerender(
      <TraceWaterfall
        clips={clips}
        tracks={tracks}
        layout="lanes"
        followMode="off"
        currentTime={2.5}
      />
    );
    expect(scroller.getAttribute("data-wf-layout")).toBe("lanes");
  });

  test("搜索命中片段保留，无结果显示空态", () => {
    const { container, getByLabelText, getByText } = render(
      <TraceWaterfall clips={clips} tracks={tracks} />
    );

    fireEvent.change(getByLabelText("搜索片段"), {
      target: { value: "C" },
    });

    const ids = [...container.querySelectorAll('[data-wf="bar"]')]
      .map(bar => bar.getAttribute("data-clip-id"));
    expect(ids).toEqual(["C"]);

    fireEvent.change(getByLabelText("搜索片段"), {
      target: { value: "zzz" },
    });
    expect(getByText("没有匹配 “zzz” 的片段")).toBeTruthy();
  });

  test("ms / s 只影响文案，不影响条形像素位置", () => {
    const { container: seconds } = render(
      <TraceWaterfall clips={[D]} unit="s" />
    );
    const leftSeconds = q<HTMLElement>(seconds, '[data-clip-id="D"]').style.left;
    const totalSeconds =
      q<HTMLElement>(seconds, '[data-wf="total-time"]').textContent;

    const { container: millis } = render(
      <TraceWaterfall clips={[D]} unit="ms" />
    );
    const leftMillis = q<HTMLElement>(millis, '[data-clip-id="D"]').style.left;
    const totalMillis =
      q<HTMLElement>(millis, '[data-wf="total-time"]').textContent;

    expect(leftSeconds).toBe(leftMillis);
    expect(totalSeconds).not.toBe(totalMillis);
  });

  test("clips 为空时显示空态，即使声明了 tracks", () => {
    const { getByText, container } = render(
      <TraceWaterfall clips={[]} tracks={tracks} />
    );

    expect(getByText("暂无时间线数据")).toBeTruthy();
    expect(container.querySelectorAll('[data-wf="row"]').length).toBe(0);
  });

  test("labels 可覆盖搜索与空结果文案", () => {
    const { getByLabelText, getByText } = render(
      <TraceWaterfall
        clips={[A]}
        labels={{ search: "查找片段", noMatch: query => `无 ${query}` }}
      />
    );

    fireEvent.change(getByLabelText("查找片段"), {
      target: { value: "zzz" },
    });
    expect(getByText("无 zzz")).toBeTruthy();
  });

  test("duration <= 0 渲染为 2px 点片段", () => {
    const point: TimelineClip = {
      id: "P",
      name: "P",
      index: 0,
      start: 2,
      duration: 0,
    };
    const { container } = render(
      <TraceWaterfall clips={[point]} viewStart={0} viewDuration={5} />
    );

    const bar = q<HTMLElement>(container, '[data-clip-id="P"]');
    expect(bar.style.width).toBe("2px");
    expect(
      getActiveAt([point], 2, { start: 0, end: 5, duration: 5 }).map(
        clip => clip.id
      )
    ).toEqual(["P"]);
    expect(
      getActiveAt([point], 3, { start: 0, end: 5, duration: 5 })
    ).toEqual([]);
  });

  test("showSearch / showZoom 关闭时不渲染工具栏，受控 zoom 生效", () => {
    const { container, rerender } = render(
      <TraceWaterfall
        clips={[D]}
        showSearch={false}
        showZoom={false}
        zoom={1}
      />
    );

    expect(container.querySelector('[data-wf="search"]')).toBeNull();
    expect(container.querySelector('[data-wf="zoom"]')).toBeNull();
    expect(q<HTMLElement>(container, '[data-clip-id="D"]').style.width).toBe("320px");

    rerender(
      <TraceWaterfall
        clips={[D]}
        showSearch={false}
        showZoom={false}
        zoom={2}
      />
    );

    expect(q<HTMLElement>(container, '[data-clip-id="D"]').style.width).toBe("640px");
  });

  test("详情中的时长不叠加 SMPTE offset", () => {
    const { container } = render(
      <TraceWaterfall
        clips={[A]}
        unit="s"
        formatTime={{ type: "smpte", fps: 25, offset: 36000 }}
        currentTime={0}
      />
    );

    fireEvent.click(q<HTMLElement>(container, '[data-clip-id="A"]'));

    const detail = q<HTMLElement>(container, '[data-wf="detail"]');
    const values = [...detail.querySelectorAll("dd")];
    expect(values[1].textContent).toBe("10:00:00:00");
    expect(values[2].textContent).toBe("10:00:01:00");
    expect(values[3].textContent).toBe("00:00:01:00");
  });
});
