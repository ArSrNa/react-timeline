/* AV Timeline MVP —— 纯 HTML/CSS/JS，按 docs/trace-waterfall/spec.md (v3) 实现 */

// ---------------------------------------------------------------- 参考数据
// 导播场景切换表：只取 time 与 sceneName，按场景名分轨

const TOTAL = 36;

// 导播场景切换表（只使用 time 与 sceneName）
const SCENE_CHANGES = [
  { time: 0, sceneName: '场景 3' },
  { time: 3.25, sceneName: '场景' },
  { time: 7.05, sceneName: 'sy' },
  { time: 12.55, sceneName: '场景 2' },
  { time: 13.6, sceneName: '北京时间' },
  { time: 15.4, sceneName: '场景 3' },
  { time: 17.35, sceneName: 'vid' },
  { time: 22.84, sceneName: 'sy' },
  { time: 24.44, sceneName: '场景 2' },
  { time: 27.08, sceneName: '场景 3' },
  { time: 30.43, sceneName: '北京时间' },
  { time: 32.47, sceneName: '北京时间' }
];

// 场景首次出现的顺序即轨道顺序
const SCENE_NAMES = SCENE_CHANGES.reduce((names, change) => {
  if (!names.includes(change.sceneName)) names.push(change.sceneName);
  return names;
}, []);

const CLIP_COLORS = [
  'var(--clip-1)', 'var(--clip-2)', 'var(--clip-3)',
  'var(--clip-4)', 'var(--clip-5)', 'var(--clip-6)'
];

const TRACKS = SCENE_NAMES.map((name, index) => ({
  index,
  name,
  short: name,
  color: CLIP_COLORS[index % CLIP_COLORS.length]
}));

// 每个切换点生成一个片段：终点取下一个切换点，末尾补到 TOTAL
const CLIPS = SCENE_CHANGES.map((change, i) => {
  const end = i + 1 < SCENE_CHANGES.length ? SCENE_CHANGES[i + 1].time : TOTAL;
  const index = SCENE_NAMES.indexOf(change.sceneName);
  return {
    id: `scene-${i}`,
    name: change.sceneName,
    index,
    start: change.time,
    duration: Math.max(end - change.time, 0),
    color: CLIP_COLORS[index % CLIP_COLORS.length]
  };
});

const CLIP_END = clip => (typeof clip.end === 'number' ? clip.end : clip.start + clip.duration);

const ZOOMS = [0.5, 1, 1.5, 2, 4];
const LABEL_W = 220;
const MIN_TICK_GAP = 64;

// ---------------------------------------------------------------- 状态

const state = {
  layout: 'lanes',
  zoom: 1.5,
  format: 'clock',
  currentTime: 5,
  query: '',
  playing: false,
  fixedPlayhead: false,
  playheadPosition: 0.5,
  followMode: 'off' // off | scroll | hide
};

// ---------------------------------------------------------------- DOM

const scroller = document.getElementById('scroller');
const canvas = document.getElementById('canvas');
const zoomBox = document.getElementById('zoom');
const searchInput = document.getElementById('searchInput');
const formatSelect = document.getElementById('formatSelect');
const themeBtn = document.getElementById('themeBtn');
const playBtn = document.getElementById('playBtn');
const nowTime = document.getElementById('nowTime');
const totalTime = document.getElementById('totalTime');
const timeSlider = document.getElementById('timeSlider');
const layoutSeg = document.getElementById('layoutSeg');
const fixedPlayheadEl = document.getElementById('fixedPlayhead');
const playheadPosEl = document.getElementById('playheadPos');
const followModeEl = document.getElementById('followMode');
const popover = document.getElementById('popover');
const popTitle = document.getElementById('popTitle');
const popDot = document.getElementById('popDot');
const popKv = document.getElementById('popKv');
const popRaw = document.getElementById('popRaw');

// ---------------------------------------------------------------- 工具

const pad = (n, len = 2) => String(n).padStart(len, '0');
const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function trimNumber(value) {
  return String(Number(value.toFixed(3)));
}

function clock(value, withMillisecond) {
  const negative = value < 0;
  const total = Math.round(Math.abs(value) * 1000);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  let out = `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (withMillisecond) out += `.${pad(ms, 3)}`;
  return (negative ? '-' : '') + out;
}

function smpte(value, fps = 25, offset = 36000) {
  const frames = Math.round((offset + value) * fps);
  const negative = frames < 0;
  const abs = Math.abs(frames);
  const ff = abs % fps;
  const totalSeconds = Math.floor(abs / fps);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${negative ? '-' : ''}${pad(h)}:${pad(m)}:${pad(s)}:${pad(ff)}`;
}

function formatTime(value) {
  if (state.format === 'number') return trimNumber(value);
  if (state.format === 'smpte') return smpte(value, 25, 36000); // 10:00:00:00 起
  return clock(value, true);
}

function shortDuration(value) {
  if (value >= 60) return `${Math.floor(value / 60)}m${Math.round(value % 60)}s`;
  return `${trimNumber(value)}s`;
}

function niceStep(min) {
  if (!Number.isFinite(min) || min <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(min)));
  for (const candidate of [1, 2, 5, 10]) {
    const step = candidate * pow;
    if (step >= min) return step;
  }
  return 10 * pow;
}

function highlight(text, query) {
  const raw = String(text);
  const keyword = query.trim();
  if (!keyword) return esc(raw);
  const index = raw.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return esc(raw);
  return esc(raw.slice(0, index))
    + `<mark class="mark">${esc(raw.slice(index, index + keyword.length))}</mark>`
    + esc(raw.slice(index + keyword.length));
}

function trackOf(index) {
  return TRACKS.find(track => track.index === index);
}

function clipColor(clip) {
  const track = trackOf(clip.index);
  if (clip.color) return clip.color;
  if (track && track.color) return track.color;
  return CLIP_COLORS[clip.index % CLIP_COLORS.length];
}

function textOn(color) {
  if (!color || color.indexOf('var(') === 0) return '#fff';
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14161c' : '#fff';
}

// ---------------------------------------------------------------- 视图与几何

function getView() {
  return { start: 0, duration: TOTAL, end: TOTAL };
}

function viewportWidth() {
  return scroller.clientWidth || 900;
}

function getLayout() {
  const view = getView();
  const trackWidth = Math.max(viewportWidth() - LABEL_W, 320);
  const px = (trackWidth / view.duration) * state.zoom;
  // 固定播放头时在时间 0 之前留出 lead，保证开头游标就停在设定位置
  const lead = state.fixedPlayhead
    ? trackWidth * Math.min(Math.max(state.playheadPosition, 0), 1)
    : 0;
  return { view, px, contentWidth: view.duration * px, lead };
}

function clampTime(time) {
  const view = getView();
  return Math.min(Math.max(time, view.start), view.end);
}

function xOf(time, view, px) {
  return (Math.min(Math.max(time, view.start), view.end) - view.start) * px;
}

function isActive(clip, time) {
  return clip.start <= time && time <= CLIP_END(clip);
}

// ---------------------------------------------------------------- 行构建

function matchClip(clip, query) {
  if (!query) return true;
  return [clip.name || '', clip.id].some(value => value.toLowerCase().includes(query));
}

function buildRows() {
  const query = state.query.trim().toLowerCase();

  if (state.layout === 'sequence') {
    return CLIPS
      .slice()
      .sort((a, b) => a.start - b.start)
      .filter(clip => matchClip(clip, query))
      .map(clip => ({
        id: `seq-${clip.id}`,
        label: clip.name || clip.id,
        dot: clipColor(clip),
        tag: (trackOf(clip.index) || {}).short || `轨道 ${clip.index}`,
        durationText: shortDuration(CLIP_END(clip) - clip.start),
        clips: [clip],
        start: clip.start,
        end: CLIP_END(clip)
      }));
  }

  return TRACKS.map(track => {
    const clips = CLIPS.filter(clip => clip.index === track.index);
    const visible = query ? clips.filter(clip => matchClip(clip, query)) : clips;
    return {
      id: `track-${track.index}`,
      label: track.name,
      dot: track.color,
      tag: '',
      durationText: '',
      clips: visible,
      start: visible.reduce((min, clip) => Math.min(min, clip.start), Infinity),
      end: visible.reduce((max, clip) => Math.max(max, CLIP_END(clip)), -Infinity),
      empty: visible.length === 0
    };
  }).filter(row => !query || !row.empty);
}

// ---------------------------------------------------------------- 渲染

function renderRuler(view, px, contentWidth, lead) {
  const step = niceStep(MIN_TICK_GAP / px);
  const first = Math.ceil(view.start / step) * step;
  let ticks = '';

  for (let i = 0; i < 500; i++) {
    const value = first + i * step;
    if (value > view.end + step * 1e-6) break;
    ticks += `<span class="tick" style="left:${((value - view.start) * px).toFixed(2)}px">${esc(formatTime(value))}</span>`;
  }

  return `<div class="ruler">
    <div class="ruler-label" style="width:${LABEL_W}px">${state.layout === 'lanes' ? '轨道' : '片段'}</div>
    <div class="ruler-track" style="width:${contentWidth}px;margin-left:${lead}px">${ticks}</div>
  </div>`;
}

function renderRow(row, view, px, contentWidth, lead) {
  const bars = row.clips.map(clip => {
    const start = Math.max(clip.start, view.start);
    const end = Math.min(CLIP_END(clip), view.end);
    if (end <= start) return '';

    const left = (start - view.start) * px;
    const width = Math.max((end - start) * px, 2);
    const label = clip.name || clip.id;
    const color = clipColor(clip);
    const active = isActive(clip, state.currentTime);

    return `<button type="button" class="bar ${active ? 'active' : ''}" data-kind="clip" data-id="${esc(clip.id)}"
      data-start="${clip.start}" data-end="${CLIP_END(clip)}"
      style="left:${left.toFixed(2)}px;width:${width.toFixed(2)}px;background:${color};color:${textOn(color)}"
      title="${esc(label)} · ${esc(shortDuration(CLIP_END(clip) - clip.start))}"
      aria-label="${esc(label)} ${esc(shortDuration(CLIP_END(clip) - clip.start))}">
      ${width > 60 ? `<span>${highlight(label, state.query)}</span>` : ''}
    </button>`;
  }).join('');

  return `<div class="row" data-start="${Number.isFinite(row.start) ? row.start : 0}" data-end="${Number.isFinite(row.end) ? row.end : 0}">
    <div class="label" style="width:${LABEL_W}px;padding-left:8px" title="${esc(row.label)}">
      <span class="dot" style="background:${row.dot}"></span>
      <span class="name">${highlight(row.label, state.query)}</span>
      ${row.tag ? `<span class="tag">${esc(row.tag)}</span>` : ''}
      ${row.durationText ? `<span class="dur">${esc(row.durationText)}</span>` : ''}
    </div>
    <div class="track" style="width:${contentWidth}px;margin-left:${lead}px">${bars}</div>
  </div>`;
}

function renderCanvas() {
  const { view, px, contentWidth, lead } = getLayout();
  const rows = buildRows();
  const query = state.query.trim();
  const step = niceStep(MIN_TICK_GAP / px);

  const body = rows.length
    ? `<div class="grid" style="left:${LABEL_W + lead}px;width:${contentWidth}px;background-size:${Math.max(step * px, 1)}px 100%"></div>
       <div class="rows">${rows.map(row => renderRow(row, view, px, contentWidth, lead)).join('')}</div>`
    : `<div class="empty">${query ? `没有匹配 “${esc(query)}” 的步骤` : '暂无 timeline 数据'}</div>`;

  const cursorLeft = LABEL_W + lead + xOf(state.currentTime, view, px);

  canvas.style.width = `${LABEL_W + lead + contentWidth}px`;
  canvas.innerHTML = renderRuler(view, px, contentWidth, lead)
    + body
    + `<div class="cursor" data-live="cursor" style="left:${cursorLeft}px"></div>`;
}

function renderZoom() {
  zoomBox.innerHTML = ZOOMS.map(level => `<button type="button" data-zoom="${level}"
    class="${level === state.zoom ? 'active' : ''}" aria-pressed="${level === state.zoom}">${level}x</button>`).join('');
}

function render() {
  const scrollLeft = scroller.scrollLeft;
  state.currentTime = clampTime(state.currentTime);

  renderZoom();
  renderCanvas();

  totalTime.textContent = formatTime(TOTAL);
  timeSlider.max = String(TOTAL);
  timeSlider.value = String(state.currentTime);

  scroller.scrollLeft = scrollLeft;
  updateLive();
}

// ---------------------------------------------------------------- 实时更新

function applyViewport() {
  const { view, px } = getLayout();
  const time = clampTime(state.currentTime);

  if (state.fixedPlayhead) {
    // lead 已把时间 0 放到播放头位置，滚动量就是经过的像素
    scroller.scrollLeft = Math.max(0, xOf(time, view, px));
  }

  if (state.layout !== 'sequence' || state.followMode === 'off') return;

  const rows = canvas.querySelectorAll('.row');
  if (!rows.length) return;

  // 直接消失：已结束的行折叠掉，第一个仍在时长内的行自然贴顶
  if (state.followMode === 'hide') {
    rows.forEach(row => {
      row.classList.toggle('gone', Number(row.dataset.end) < time);
    });
    scroller.scrollTop = 0;
    return;
  }

  // 上滚：把第一个仍在时长内的行滚到标尺下方
  let target = -1;
  for (let i = 0; i < rows.length; i++) {
    const start = Number(rows[i].dataset.start);
    const end = Number(rows[i].dataset.end);
    if (start <= time && time <= end) {
      target = i;
      break;
    }
  }
  if (target < 0) {
    for (let i = 0; i < rows.length; i++) {
      if (Number(rows[i].dataset.end) >= time) {
        target = i;
        break;
      }
    }
  }
  if (target >= 0) {
    const rowHeight = rows[0].offsetHeight || 32;
    scroller.scrollTop = target * rowHeight;
  }
}

function updateLive() {
  const { view, px, lead } = getLayout();
  const time = clampTime(state.currentTime);

  const cursor = canvas.querySelector('[data-live="cursor"]');
  if (cursor) cursor.style.left = `${LABEL_W + lead + xOf(time, view, px)}px`;

  nowTime.textContent = formatTime(time);
  timeSlider.value = String(time);

  canvas.querySelectorAll('.bar').forEach(bar => {
    const start = Number(bar.dataset.start);
    const end = Number(bar.dataset.end);
    bar.classList.toggle('active', start <= time && time <= end);
  });

  applyViewport();
}

// ---------------------------------------------------------------- 播放

let rafId = null;
let lastTimestamp = 0;

function stopPlay() {
  state.playing = false;
  playBtn.textContent = '播放';
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

function startPlay() {
  state.playing = true;
  playBtn.textContent = '暂停';
  lastTimestamp = performance.now();

  const step = timestamp => {
    if (!state.playing) return;
    const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    const next = state.currentTime + delta;
    if (next >= TOTAL) {
      state.currentTime = TOTAL;
      updateLive();
      stopPlay();
      return;
    }

    state.currentTime = next;
    updateLive();
    rafId = requestAnimationFrame(step);
  };

  rafId = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- 详情

function hidePopover() {
  popover.hidden = true;
}

function openPopover(id, event) {
  const clip = CLIPS.find(item => item.id === id);
  if (!clip) return;

  const track = trackOf(clip.index);
  popTitle.textContent = clip.name || clip.id;
  popDot.style.background = clipColor(clip);

  popKv.innerHTML = [
    ['轨道', `${clip.index} · ${track ? track.name : '未命名'}`],
    ['起点', formatTime(clip.start)],
    ['结束', formatTime(CLIP_END(clip))],
    ['时长', formatTime(CLIP_END(clip) - clip.start)]
  ].map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('');

  if (clip.meta) {
    popRaw.hidden = false;
    try {
      popRaw.textContent = JSON.stringify(clip.meta, null, 2);
    } catch {
      popRaw.textContent = '[无法序列化的数据]';
    }
  } else {
    popRaw.hidden = true;
    popRaw.textContent = '';
  }

  popover.hidden = false;
  const width = popover.offsetWidth || 300;
  const height = popover.offsetHeight || 200;
  popover.style.left = `${Math.max(12, Math.min(event.clientX + 12, window.innerWidth - width - 12))}px`;
  popover.style.top = `${Math.max(12, Math.min(event.clientY + 12, window.innerHeight - height - 12))}px`;
}

// ---------------------------------------------------------------- 交互

function applyLayout(layout) {
  state.layout = layout;
  [...layoutSeg.querySelectorAll('[data-layout]')].forEach(item => {
    const active = item.dataset.layout === layout;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
}

layoutSeg.addEventListener('click', event => {
  const button = event.target.closest('[data-layout]');
  if (!button || button.dataset.layout === state.layout) return;

  // 首行跟随只对平铺布局有意义，切回多轨时自动关闭
  if (button.dataset.layout === 'lanes' && state.followMode !== 'off') {
    state.followMode = 'off';
    followModeEl.value = 'off';
  }

  applyLayout(button.dataset.layout);
  stopPlay();
  scroller.scrollTop = 0;
  render();
});

formatSelect.addEventListener('change', () => {
  state.format = formatSelect.value;
  render();
});

themeBtn.addEventListener('click', () => {
  const light = document.body.classList.toggle('light');
  themeBtn.textContent = light ? '深色' : '浅色';
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  render();
});

zoomBox.addEventListener('click', event => {
  const button = event.target.closest('[data-zoom]');
  if (!button) return;

  const nextZoom = Number(button.dataset.zoom);
  if (nextZoom === state.zoom) return;

  const { view, px, lead } = getLayout();
  const centerTime = view.start + (scroller.scrollLeft + scroller.clientWidth / 2 - LABEL_W - lead) / px;

  state.zoom = nextZoom;
  render();

  if (state.fixedPlayhead) return;
  const { px: nextPx } = getLayout();
  scroller.scrollLeft = Math.max(0, LABEL_W + (centerTime - view.start) * nextPx - scroller.clientWidth / 2);
});

canvas.addEventListener('click', event => {
  const rulerTrack = event.target.closest('.ruler-track');
  if (rulerTrack) {
    const rect = rulerTrack.getBoundingClientRect();
    const { view, px } = getLayout();
    state.currentTime = clampTime(view.start + (event.clientX - rect.left) / px);
    updateLive();
    return;
  }

  const bar = event.target.closest('.bar');
  if (bar) {
    // 只开详情，不移动播放头
    openPopover(bar.dataset.id, event);
  }
});

timeSlider.addEventListener('input', () => {
  state.currentTime = clampTime(Number(timeSlider.value));
  updateLive();
});

fixedPlayheadEl.addEventListener('change', () => {
  state.fixedPlayhead = fixedPlayheadEl.checked;
  // lead 会变化，需要重建内容宽度
  render();
});

playheadPosEl.addEventListener('change', () => {
  state.playheadPosition = Number(playheadPosEl.value);
  render();
});

followModeEl.addEventListener('change', () => {
  state.followMode = followModeEl.value;

  // 开启跟随需要平铺布局：按时间顺序一行一个片段，才能逐行上滚
  if (state.followMode !== 'off' && state.layout !== 'sequence') {
    applyLayout('sequence');
  }

  scroller.scrollTop = 0;
  render();
});

playBtn.addEventListener('click', () => {
  if (state.playing) stopPlay();
  else startPlay();
});

document.getElementById('popClose').addEventListener('click', hidePopover);

document.addEventListener('mousedown', event => {
  if (popover.hidden) return;
  if (popover.contains(event.target)) return;
  hidePopover();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hidePopover();

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    const wf = document.getElementById('wf');
    if (!wf.contains(document.activeElement) && !wf.matches(':hover')) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

window.addEventListener('resize', render);

// ---------------------------------------------------------------- 启动

render();
