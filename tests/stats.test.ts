import { describe, expect, it } from "vitest";
import { histogram, linearFit, rolling, standardDeviation, summariseRuns } from "../src/stats/analysis";
import { parseRunLogFile, RunLog, type RunRecord } from "../src/stats/runLog";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const record = (runId: string, chest: number, delta: number | null, extra: Partial<RunRecord> = {}): RunRecord => ({
  id: `${runId}#${chest}`,
  runId,
  at: Number(runId.replace(/\D/g, "")) || 0,
  source: "manual",
  area: "lowerKurast",
  players: 5,
  rune: "Ber",
  chest,
  targetDraw: 300,
  actualDraw: delta === null ? null : 300 + delta,
  delta,
  wait: 120,
  fireRate: 1.55,
  excluded: false,
  note: "",
  ...extra,
});

describe("linearFit", () => {
  it("recovers an exact line and reports no residual", () => {
    const fit = linearFit([0, 10, 20, 30].map((x) => ({ x, y: 105 + 1.55 * x })))!;
    expect(fit.slope).toBeCloseTo(1.55, 10);
    expect(fit.intercept).toBeCloseTo(105, 10);
    expect(fit.residualSD).toBeCloseTo(0, 10);
  });

  it("needs three points with spread in x", () => {
    expect(linearFit([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(linearFit([1, 2, 3].map((y) => ({ x: 5, y })))).toBeNull();
  });
});

describe("summariseRuns", () => {
  it("counts a run as a hit when a later chest lands on the plan, and keeps the first chest's delta", () => {
    const runs = summariseRuns([record("r1", 1, -4), record("r1", 2, 0), record("r2", 1, 7)]);
    expect(runs.map((r) => [r.runId, r.first.delta, r.hit, r.hitChest])).toEqual([
      ["r1", -4, true, 2],
      ["r2", 7, false, null],
    ]);
  });

  it("skips excluded records and measurements without a delta", () => {
    const runs = summariseRuns([record("r1", 1, 3, { excluded: true }), record("r2", 1, null), record("r3", 1, 0)]);
    expect(runs.map((r) => r.runId)).toEqual(["r3"]);
  });
});

describe("rolling and histogram", () => {
  it("rolls hit rate and spread over a trailing window", () => {
    const runs = summariseRuns([0, 4, -4, 0].map((delta, i) => record(`r${i + 1}`, 1, delta)));
    const points = rolling(runs, 2);
    expect(points.map((p) => p.hitRate)).toEqual([0.5, 0, 0.5]);
    expect(points[1].sd).toBeCloseTo(standardDeviation([4, -4])!, 10);
  });

  it("centres a bin on zero", () => {
    const bins = histogram([-1, 0, 0, 1, 3], 2);
    expect(bins.find((b) => b.from === -1)?.count).toBe(3);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
  });
});

describe("run log files", () => {
  it("imports the hand-kept history format, splitting a second-chest hit into two chests", () => {
    const records = parseRunLogFile(
      JSON.stringify({
        export_date: "2026-11-12",
        targeted_opening_tests: [
          { id: "T05", target_rune: "Ist", players: 7, wait_seconds: 147.6, fire_rate: 1.45, target_draw: 321, actual_draw: 321, draw_delta: 0, hit_chest_index: 2, first_chest_actual_draw: 317, first_chest_delta_from_target: -4 },
          { id: "T06", target_draw: 133, actual_draw: 116, draw_delta: -17, excluded_from_statistics: true },
        ],
        normal_wait_draw_tests: { fire_rate: 1.5625, runs: [{ id: "N01", wait_seconds: 23.7, draw_delta: -9 }] },
        calibration: { fire_rate: { long_wait_test: { wait_seconds: 120, observed_draw: 301 } } },
      }),
    )!;
    expect(records.map((r) => [r.runId, r.chest, r.delta, r.excluded])).toEqual([
      ["history:T05", 1, -4, false],
      ["history:T05", 2, 0, false],
      ["history:T06", 1, -17, true],
      ["history:N01", 1, -9, false],
      ["history:fire-rate-test", 1, null, false],
    ]);
    expect(records[4]).toMatchObject({ wait: 120, actualDraw: 301 });
  });

  it("round-trips its own export and merges by id", () => {
    const log = new RunLog(memoryStorage());
    log.upsert(record("r1", 1, 2));
    const copy = new RunLog(memoryStorage());
    expect(copy.merge(parseRunLogFile(log.exportJson())!)).toBe(1);
    expect(copy.merge(parseRunLogFile(log.exportJson())!)).toBe(0);
    expect(copy.all).toHaveLength(1);
  });

  it("rejects files it doesn't know", () => {
    expect(parseRunLogFile("{\"type\":\"d2lkscp-route-samples\"}")).toBeNull();
    expect(parseRunLogFile("not json")).toBeNull();
  });
});
