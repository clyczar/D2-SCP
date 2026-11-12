import { el } from "./dom";

const SVG = "http://www.w3.org/2000/svg";
const W = 640;
const H = 240;
const M = { left: 48, right: 14, top: 14, bottom: 40 };
const HIT_RADIUS = 24;

export type MarkKind = "hit" | "miss" | "point";

export interface ChartPoint {
  x: number;
  y: number;
  tip: string;
  kind?: MarkKind;
}

export interface ChartAxis {
  label: string;
  format?: (value: number) => string;
  /** Force the domain to include these values, e.g. 0. */
  include?: readonly number[];
}

export interface ScatterOptions {
  points: readonly ChartPoint[];
  x: ChartAxis;
  y: ChartAxis;
  /** A fitted line drawn across the x range. */
  line?: { slope: number; intercept: number };
  /** Join points in x order, for a trend. */
  connect?: boolean;
  /** Shade |y| <= band around zero and draw the zero line. */
  zeroBand?: number;
  empty: string;
}

export interface BarOptions {
  bars: readonly { label: string; value: number; tip: string; emphasis?: boolean }[];
  y: ChartAxis;
  x: { label: string };
  empty: string;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** About `count` round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const step = [1, 2, 2.5, 5, 10].map((f) => f * 10 ** Math.floor(Math.log10(raw))).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(+t.toFixed(10));
  if (ticks[0] > min) ticks.unshift(ticks[0] - step);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

function scale(domain: readonly number[], from: number, to: number) {
  const [d0, d1] = [domain[0], domain.at(-1)!];
  return (v: number) => from + ((v - d0) / (d1 - d0 || 1)) * (to - from);
}

function frame(xTicks: readonly number[], yTicks: readonly number[], x: (v: number) => number, y: (v: number) => number, xAxis: ChartAxis, yAxis: ChartAxis) {
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img" });
  const grid = svg("g", { class: "chart-grid" });
  for (const t of yTicks) {
    grid.append(svg("line", { x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }));
    const label = svg("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end" });
    label.textContent = (yAxis.format ?? String)(t);
    grid.append(label);
  }
  for (const t of xTicks) {
    const label = svg("text", { x: x(t), y: H - M.bottom + 16, "text-anchor": "middle" });
    label.textContent = (xAxis.format ?? String)(t);
    grid.append(label);
  }
  const xLabel = svg("text", { x: (M.left + W - M.right) / 2, y: H - 6, "text-anchor": "middle", class: "chart-axis-label" });
  xLabel.textContent = xAxis.label;
  const yLabel = svg("text", { x: 12, y: (M.top + H - M.bottom) / 2, "text-anchor": "middle", class: "chart-axis-label", transform: `rotate(-90 12 ${(M.top + H - M.bottom) / 2})` });
  yLabel.textContent = yAxis.label;
  grid.append(xLabel, yLabel);
  root.append(grid);
  return root;
}

function withTooltip(root: SVGSVGElement, targets: readonly { cx: number; cy: number; tip: string }[]): HTMLElement {
  const tip = el("div", { className: "chart-tip", hidden: true });
  const wrap = el("div", { className: "chart" }, tip);
  wrap.prepend(root);
  const cursor = svg("circle", { r: 9, class: "chart-cursor", visibility: "hidden" });
  root.append(cursor);
  root.addEventListener("pointermove", (event) => {
    const box = root.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const py = ((event.clientY - box.top) / box.height) * H;
    const perUnit = box.width / W;
    let best: (typeof targets)[number] | null = null;
    let bestDistance = HIT_RADIUS / perUnit;
    for (const target of targets) {
      const distance = Math.hypot(target.cx - px, target.cy - py);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    tip.hidden = !best;
    cursor.setAttribute("visibility", best ? "visible" : "hidden");
    if (!best) return;
    cursor.setAttribute("cx", String(best.cx));
    cursor.setAttribute("cy", String(best.cy));
    tip.textContent = best.tip;
    const left = best.cx * perUnit;
    tip.style.left = `${Math.min(Math.max(left, 70), box.width - 70)}px`;
    tip.style.top = `${best.cy * perUnit}px`;
  });
  root.addEventListener("pointerleave", () => {
    tip.hidden = true;
    cursor.setAttribute("visibility", "hidden");
  });
  return wrap;
}

export function scatterChart(options: ScatterOptions): HTMLElement {
  const { points } = options;
  if (points.length === 0) return el("p", { className: "chart-empty", textContent: options.empty });
  const xs = [...points.map((p) => p.x), ...(options.x.include ?? [])];
  const ys = [...points.map((p) => p.y), ...(options.y.include ?? [])];
  if (options.zeroBand !== undefined) ys.push(-options.zeroBand, options.zeroBand);
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs));
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys));
  const x = scale(xTicks, M.left, W - M.right);
  const y = scale(yTicks, H - M.bottom, M.top);
  const root = frame(xTicks, yTicks, x, y, options.x, options.y);

  if (options.zeroBand !== undefined) {
    root.append(
      svg("rect", { x: M.left, width: W - M.left - M.right, y: y(options.zeroBand), height: y(-options.zeroBand) - y(options.zeroBand), class: "chart-band" }),
      svg("line", { x1: M.left, x2: W - M.right, y1: y(0), y2: y(0), class: "chart-zero" }),
    );
  }
  if (options.line) {
    const { slope, intercept } = options.line;
    const [x0, x1] = [xTicks[0], xTicks.at(-1)!];
    root.append(svg("line", { x1: x(x0), y1: y(intercept + slope * x0), x2: x(x1), y2: y(intercept + slope * x1), class: "chart-fit" }));
  }
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (options.connect && sorted.length > 1) {
    root.append(svg("polyline", { points: sorted.map((p) => `${x(p.x)},${y(p.y)}`).join(" "), class: "chart-trend" }));
  }
  const targets = sorted.map((p) => {
    const cx = x(p.x);
    const cy = y(p.y);
    root.append(svg("circle", { cx, cy, r: p.kind === "hit" ? 6 : 4.5, class: `chart-mark ${p.kind ?? "point"}` }));
    return { cx, cy, tip: p.tip };
  });
  return withTooltip(root, targets);
}

export function barChart(options: BarOptions): HTMLElement {
  const { bars } = options;
  if (bars.length === 0) return el("p", { className: "chart-empty", textContent: options.empty });
  const yTicks = niceTicks(0, Math.max(1, ...bars.map((b) => b.value)), 4);
  const y = scale(yTicks, H - M.bottom, M.top);
  const slot = (W - M.left - M.right) / bars.length;
  const root = frame([], yTicks, () => 0, y, { label: options.x.label }, options.y);
  const labelEvery = Math.ceil(bars.length / 12);
  const targets = bars.map((bar, i) => {
    const left = M.left + i * slot + 1;
    const top = y(bar.value);
    const width = Math.max(1, slot - 2);
    if (bar.value > 0) {
      root.append(svg("path", { d: roundedTop(left, top, width, H - M.bottom - top, Math.min(4, width / 2)), class: `chart-bar${bar.emphasis ? " emphasis" : ""}` }));
    }
    if (i % labelEvery === 0) {
      const label = svg("text", { x: left + width / 2, y: H - M.bottom + 16, "text-anchor": "middle", class: "chart-tick" });
      label.textContent = bar.label;
      root.append(label);
    }
    return { cx: left + width / 2, cy: Math.min(top, H - M.bottom - 6), tip: bar.tip };
  });
  return withTooltip(root, targets);
}

/** A bar whose top corners are rounded and whose base stays square on the axis. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}
