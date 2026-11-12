import type { ChestPatterns } from "./patterns";
import { chestRunes, RUNES, type Rune } from "./runePlan";

/** Draws between one super chest and the next on a run (measured 317 → 321 on a Lower Kurast run). */
export const CHEST_GAP = 4;
export const CHESTS_PER_RUN = 6;
/** Chance a given super chest spawned locked, so its extra cycle counts (matches the planner's badge). */
export const LOCKED_CHANCE = 0.21;
/** Seconds a planned run costs beyond its wait: a new game, the gamble window, the route and the chests. */
export const RUN_SECONDS = 100;
const SPAN = 30;
const MIN_SAMPLES_FOR_SHAPE = 8;
const FALLBACK_SD = 7;

const BER = RUNES.indexOf("Ber");
const PUL = RUNES.indexOf("Pul");

/** A rune's worth in Ber, from the cube's 2:1 upgrades above Pul (2 Sur + a gem make a Ber); lower runes count 0. */
export function berValue(rune: Rune): number {
  const rank = RUNES.indexOf(rune);
  return rank >= PUL ? 2 ** (rank - BER) : 0;
}

/** How far first chests land from the planned draw: p[offset + span] for offsets -span..span. */
export interface ErrorModel {
  span: number;
  p: Float64Array;
  samples: number;
  mean: number;
  sd: number;
}

/**
 * Builds the landing distribution from logged first-chest deltas: a smoothed histogram once there are enough
 * runs, a normal curve fitted to them before that, and a normal curve of ±7 with no runs at all.
 */
export function errorModel(deltas: readonly number[]): ErrorModel {
  const n = deltas.length;
  const mean = n > 0 ? deltas.reduce((s, d) => s + d, 0) / n : 0;
  const sd = n >= 3 ? Math.max(3, Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1))) : FALLBACK_SD;
  const p = new Float64Array(2 * SPAN + 1);
  if (n >= MIN_SAMPLES_FOR_SHAPE) {
    const h = Math.max(2, 1.06 * sd * n ** -0.2);
    for (let i = 0; i < p.length; i++) for (const d of deltas) p[i] += Math.exp(-((i - SPAN - d) ** 2) / (2 * h * h));
  } else {
    for (let i = 0; i < p.length; i++) p[i] = Math.exp(-((i - SPAN - mean) ** 2) / (2 * sd * sd));
  }
  const total = p.reduce((s, v) => s + v, 0);
  for (let i = 0; i < p.length; i++) p[i] /= total;
  return { span: SPAN, p, samples: n, mean, sd };
}

const values = new WeakMap<ChestPatterns, Map<number, number>>();

/** Expected Ber-equivalents in one chest seed's drop, counting its locked-only runes at the locked chance. */
export function chestValue(patterns: ChestPatterns, seed: number): number {
  let cache = values.get(patterns);
  if (!cache) values.set(patterns, (cache = new Map()));
  let value = cache.get(seed);
  if (value === undefined) {
    const { always, ifLocked } = chestRunes(patterns, seed);
    value = always.reduce((s, r) => s + berValue(r), 0) + LOCKED_CHANCE * ifLocked.reduce((s, r) => s + berValue(r), 0);
    cache.set(seed, value);
  }
  return value;
}

export interface TargetScore {
  /** Expected Ber-equivalents from all the run's chests, given where first chests tend to land. */
  expected: number;
  /** Chance one of the run's chests lands exactly on the planned draw. */
  onTarget: number;
  /** expected per hour of wait plus the run's own time. */
  perHour: number;
}

/** Scores a plan whose first chest is aimed at `draw`, over the run's chests and the landing spread. */
export function scoreTarget(stream: Uint16Array, draw: number, wait: number, patterns: ChestPatterns, model: ErrorModel): TargetScore {
  let expected = 0;
  for (let i = 0; i < model.p.length; i++) {
    const chance = model.p[i];
    if (chance < 1e-6) continue;
    for (let chest = 0; chest < CHESTS_PER_RUN; chest++) {
      const at = draw + i - model.span + CHEST_GAP * chest;
      if (at >= 1 && at <= stream.length) expected += chance * chestValue(patterns, stream[at - 1]);
    }
  }
  let onTarget = 0;
  for (let chest = 0; chest < CHESTS_PER_RUN; chest++) {
    const i = model.span - CHEST_GAP * chest;
    if (i >= 0) onTarget += model.p[i];
  }
  return { expected, onTarget, perHour: (expected * 3600) / (wait + RUN_SECONDS) };
}

/** The furthest draw scoreTarget reads past a plan's draw. */
export const SCORE_REACH = SPAN + CHEST_GAP * (CHESTS_PER_RUN - 1);
