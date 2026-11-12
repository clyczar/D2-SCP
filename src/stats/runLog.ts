import { isChestArea, type ChestAreaId } from "../chest/areas";

const STORAGE_KEY = "d2scp-run-log";
const EXPORT_TYPE = "d2scp-run-log";

export type RunSource = "manual" | "import" | "bot";

/** One opened chest measured against a plan. A run (one game) can have several, one per super chest opened. */
export interface RunRecord {
  id: string;
  runId: string;
  at: number;
  source: RunSource;
  area: ChestAreaId | null;
  players: number | null;
  rune: string | null;
  /** Which super chest of the run this was, 1 for the first one opened. */
  chest: number;
  targetDraw: number | null;
  actualDraw: number | null;
  /** actualDraw - targetDraw; null for a measurement with no target, like a timed fire-rate test. */
  delta: number | null;
  /** Seconds waited at the River of Flame waypoint. */
  wait: number | null;
  fireRate: number | null;
  excluded: boolean;
  note: string;
}

export class RunLog {
  private records: RunRecord[];
  private readonly listeners = new Set<() => void>();
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;

  constructor(storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage) {
    this.storage = storage;
    this.records = load(storage);
  }

  get all(): readonly RunRecord[] {
    return this.records;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Adds a record, or replaces the one with the same id. */
  upsert(record: RunRecord): void {
    const index = this.records.findIndex((r) => r.id === record.id);
    if (index >= 0) this.records[index] = record;
    else this.records.push(record);
    this.changed();
  }

  remove(id: string): void {
    this.records = this.records.filter((r) => r.id !== id);
    this.changed();
  }

  setExcluded(id: string, excluded: boolean): void {
    const record = this.records.find((r) => r.id === id);
    if (!record) return;
    record.excluded = excluded;
    this.changed();
  }

  /** Merges records by id; returns how many were new. */
  merge(records: readonly RunRecord[]): number {
    const known = new Set(this.records.map((r) => r.id));
    const fresh = records.filter((r) => !known.has(r.id));
    for (const record of records) {
      const index = this.records.findIndex((r) => r.id === record.id);
      if (index >= 0) this.records[index] = record;
      else this.records.push(record);
    }
    this.changed();
    return fresh.length;
  }

  clear(): void {
    this.records = [];
    this.changed();
  }

  exportJson(): string {
    return JSON.stringify({ type: EXPORT_TYPE, version: 1, runs: this.records }, null, 2);
  }

  private changed(): void {
    this.records.sort((a, b) => a.at - b.at || a.chest - b.chest);
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Storage full or blocked: keep the log in memory for this session.
    }
    for (const listener of this.listeners) listener();
  }
}

function load(storage: Pick<Storage, "getItem"> | undefined): RunRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.flatMap((entry) => cleanRecord(entry) ?? []) : [];
  } catch {
    return [];
  }
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export function cleanRecord(entry: unknown): RunRecord | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const id = str(e.id);
  const runId = str(e.runId);
  if (!id || !runId) return null;
  const source = e.source === "manual" || e.source === "bot" ? e.source : "import";
  return {
    id,
    runId,
    at: num(e.at) ?? 0,
    source,
    area: isChestArea(e.area) ? e.area : null,
    players: num(e.players),
    rune: str(e.rune),
    chest: Math.max(1, Math.round(num(e.chest) ?? 1)),
    targetDraw: num(e.targetDraw),
    actualDraw: num(e.actualDraw),
    delta: num(e.delta),
    wait: num(e.wait),
    fireRate: num(e.fireRate),
    excluded: e.excluded === true,
    note: str(e.note) ?? "",
  };
}

/**
 * Reads either this log's own export or the hand-kept history format
 * ("targeted_opening_tests" / "normal_wait_draw_tests"). Returns null when the file is neither.
 */
export function parseRunLogFile(text: string): RunRecord[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === EXPORT_TYPE && Array.isArray(d.runs)) return d.runs.flatMap((entry) => cleanRecord(entry) ?? []);
  if (Array.isArray(d.targeted_opening_tests)) return fromHistory(d);
  return null;
}

function fromHistory(d: Record<string, unknown>): RunRecord[] {
  const area: ChestAreaId = "lowerKurast";
  const base = Date.parse(typeof d.export_date === "string" ? d.export_date : "") || 0;
  const records: RunRecord[] = [];
  let order = 0;
  const record = (runId: string, fields: Partial<RunRecord>): RunRecord => ({
    id: `${runId}#${fields.chest ?? 1}`,
    runId,
    at: base + order,
    source: "import",
    area,
    players: null,
    rune: null,
    chest: 1,
    targetDraw: null,
    actualDraw: null,
    delta: null,
    wait: null,
    fireRate: null,
    excluded: false,
    note: "",
    ...fields,
  });

  for (const test of d.targeted_opening_tests as Record<string, unknown>[]) {
    order++;
    const runId = `history:${str(test.id) ?? order}`;
    const shared: Partial<RunRecord> = {
      players: num(test.players),
      rune: str(test.target_rune),
      targetDraw: num(test.target_draw),
      wait: num(test.wait_seconds),
      fireRate: num(test.fire_rate),
      excluded: test.excluded_from_statistics === true,
      note: str(test.note) ?? "",
    };
    const firstDraw = num(test.first_chest_actual_draw);
    const hitChest = num(test.hit_chest_index);
    if (firstDraw !== null && hitChest !== null && hitChest > 1) {
      records.push(record(runId, { ...shared, chest: 1, actualDraw: firstDraw, delta: num(test.first_chest_delta_from_target) }));
      records.push(record(runId, { ...shared, chest: hitChest, actualDraw: num(test.actual_draw), delta: num(test.draw_delta) }));
    } else {
      records.push(record(runId, { ...shared, chest: 1, actualDraw: num(test.actual_draw), delta: num(test.draw_delta) }));
    }
  }

  const normal = d.normal_wait_draw_tests as Record<string, unknown> | undefined;
  if (normal && Array.isArray(normal.runs)) {
    for (const run of normal.runs as Record<string, unknown>[]) {
      order++;
      records.push(
        record(`history:${str(run.id) ?? order}`, {
          wait: num(run.wait_seconds),
          delta: num(run.draw_delta),
          fireRate: num(normal.fire_rate),
          note: "normal wait test",
        }),
      );
    }
  }

  const calibration = d.calibration as Record<string, unknown> | undefined;
  const fire = (calibration?.fire_rate as Record<string, unknown> | undefined)?.long_wait_test as Record<string, unknown> | undefined;
  if (fire && num(fire.observed_draw) !== null) {
    order++;
    records.push(
      record("history:fire-rate-test", { wait: num(fire.wait_seconds), actualDraw: num(fire.observed_draw), note: "timed fire-rate test" }),
    );
  }
  return records;
}
