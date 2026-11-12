import { describe, expect, it } from "vitest";
import { ChestPatterns, encodeChestPatterns } from "../src/chest/patterns";
import { berValue, CHEST_GAP, errorModel, RUN_SECONDS, scoreTarget } from "../src/chest/tolerance";

// Three chest seeds: 1 drops nothing, 2 drops a Ber, 3 drops a Sur (only when locked).
const patterns = new ChestPatterns(
  encodeChestPatterns([
    { unlockedCycles: 1, cycles: [["Gold"]] },
    { unlockedCycles: 1, cycles: [["Ber Rune"]] },
    { unlockedCycles: 1, cycles: [["Gold"], ["Sur Rune"]] },
  ]),
);

describe("berValue", () => {
  it("halves per cube step below Ber and ignores runes under Pul", () => {
    expect(berValue("Ber")).toBe(1);
    expect(berValue("Sur")).toBe(0.5);
    expect(berValue("Pul")).toBe(1 / 512);
    expect(berValue("Lem")).toBe(0);
    expect(berValue("Jah")).toBe(2);
  });
});

describe("errorModel", () => {
  it("sums to one and centres on the logged bias", () => {
    const model = errorModel([-4, -4, -5, -3, -4, -6, -2, -4, -4]);
    expect(model.p.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    const peak = model.p.indexOf(Math.max(...model.p)) - model.span;
    expect(peak).toBe(-4);
  });

  it("falls back to a ±7 normal curve with no runs", () => {
    const model = errorModel([]);
    expect(model.sd).toBe(7);
    expect(model.p[model.span]).toBeGreaterThan(model.p[model.span + 7]);
  });
});

describe("scoreTarget", () => {
  it("credits a target that a later chest can still reach when first chests land early", () => {
    // Draw 10 holds the Ber. A spot-on landing model puts chest 1 on it; a model that always lands
    // one chest-gap early puts chest 2 on it instead, so both see the Ber.
    const stream = new Uint16Array(40).fill(1);
    stream[9] = 2;
    const exact = scoreTarget(stream, 10, 0, patterns, { ...errorModel([]), p: delta(0) });
    const early = scoreTarget(stream, 10, 0, patterns, { ...errorModel([]), p: delta(-CHEST_GAP) });
    expect(exact.expected).toBeCloseTo(1, 10);
    expect(early.expected).toBeCloseTo(1, 10);
    expect(early.onTarget).toBeCloseTo(1, 10);
    expect(exact.perHour).toBeCloseTo(3600 / RUN_SECONDS, 10);
  });

  it("counts locked-only runes at the locked chance", () => {
    const stream = new Uint16Array(40).fill(1);
    stream[9] = 3;
    const score = scoreTarget(stream, 10, 0, patterns, { ...errorModel([]), p: delta(0) });
    expect(score.expected).toBeCloseTo(0.21 * 0.5, 10);
  });
});

/** A landing model that always lands `offset` draws from plan. */
function delta(offset: number): Float64Array {
  const p = new Float64Array(61);
  p[30 + offset] = 1;
  return p;
}
