import type { RunRecord } from "./runLog";

export interface LinearFit {
  n: number;
  slope: number;
  intercept: number;
  slopeSE: number;
  residualSD: number;
}

/** Least-squares line through (x, y) points; null below 3 points or with no spread in x. */
export function linearFit(points: readonly { x: number; y: number }[]): LinearFit | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  const intercept = my - slope * mx;
  const sse = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const residualSD = Math.sqrt(sse / (n - 2));
  return { n, slope, intercept, slopeSE: residualSD / Math.sqrt(sxx), residualSD };
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation; null below 2 values. */
export function standardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** One game: its first chest and whether any of its chests landed on the planned draw. */
export interface RunSummary {
  runId: string;
  index: number;
  at: number;
  first: RunRecord;
  hit: boolean;
  hitChest: number | null;
}

/** Groups chest records into runs, keeping only runs that measured a delta against a plan and aren't excluded. */
export function summariseRuns(records: readonly RunRecord[]): RunSummary[] {
  const byRun = new Map<string, RunRecord[]>();
  for (const record of records) {
    if (record.excluded || record.delta === null) continue;
    const list = byRun.get(record.runId) ?? [];
    list.push(record);
    byRun.set(record.runId, list);
  }
  return [...byRun.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.chest - b.chest);
      const hit = sorted.find((r) => r.delta === 0);
      return { runId: sorted[0].runId, at: sorted[0].at, first: sorted[0], hit: hit !== undefined, hitChest: hit?.chest ?? null };
    })
    .sort((a, b) => a.at - b.at)
    .map((run, index) => ({ ...run, index: index + 1 }));
}

export interface RollingPoint {
  index: number;
  hitRate: number;
  sd: number | null;
  meanDelta: number;
}

/** Trailing-window hit rate, spread and bias of first-chest deltas, from the window-th run on. */
export function rolling(runs: readonly RunSummary[], window: number): RollingPoint[] {
  const points: RollingPoint[] = [];
  for (let end = window; end <= runs.length; end++) {
    const slice = runs.slice(end - window, end);
    const deltas = slice.map((run) => run.first.delta!);
    points.push({
      index: runs[end - 1].index,
      hitRate: slice.filter((run) => run.hit).length / window,
      sd: standardDeviation(deltas),
      meanDelta: mean(deltas)!,
    });
  }
  return points;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Counts values into bins of `width`, aligned so one bin is centred on zero. */
export function histogram(values: readonly number[], width: number): Bin[] {
  if (values.length === 0) return [];
  const half = width / 2;
  const lo = Math.floor((Math.min(...values) + half) / width);
  const hi = Math.floor((Math.max(...values) + half) / width);
  const bins: Bin[] = [];
  for (let k = lo; k <= hi; k++) bins.push({ from: k * width - half, to: k * width + half, count: 0 });
  for (const value of values) bins[Math.floor((value + half) / width) - lo].count++;
  return bins;
}
