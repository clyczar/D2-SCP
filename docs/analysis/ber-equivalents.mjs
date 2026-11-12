// Values Pul+ runes in Ber units (2:1 cube chain) and models Ber-equivalents per hour for each hunting threshold. Run: node docs/analysis/ber-equivalents.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const table = (name) => fileURLToPath(new URL(`../../src/data/${name}.bin`, import.meta.url));
const RUNES = ["El","Eld","Tir","Nef","Eth","Ith","Tal","Ral","Ort","Thul","Amn","Sol","Shael","Dol","Hel","Io","Lum","Ko","Fal","Lem","Pul","Um","Mal","Ist","Gul","Vex","Ohm","Lo","Sur","Ber","Jah","Cham","Zod"];
const BER = RUNES.indexOf("Ber"), PUL = RUNES.indexOf("Pul");
const val = (i) => (i >= PUL ? 2 ** (i - BER) : 0);         // Pul+ upgrade 2:1 per step, so value in Ber units
function decode(path) {
  const b = readFileSync(path), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nb = v.getUint32(7, true); let at = 11; const names = b.subarray(at, at + nb).toString().split("\n"); at += nb;
  const n = v.getUint16(at, true); at += 2; const out = [];
  for (let s = 0; s < n; s++) { const u = b[at++], l = b[at++]; const cyc = [];
    for (let c = 0; c < l; c++) { const z = b[at++]; const it = []; for (let i = 0; i < z; i++) { const f = b[at++]; it.push(names[f < 0x80 ? f : ((f & 0x7f) << 8) | b[at++]]); } cyc.push(it); }
    out.push(cyc.slice(0, u).flat()); }                      // unlocked chest
  return out;
}
const N = 65534, rate = 1.55, hit = 0.065, O = 40;              // seconds per new game with automation
function perHour(d, avg) { let best = [0, 0];                  // d = target density per draw, avg = mean value of a target
  for (let m = 1; m <= 40; m++) { const T = m * 60, p = 1 - Math.exp(-d * rate * T), w = 1 / (d * rate) - T * Math.exp(-d * rate * T) / p;
    const tph = 3600 * p / (O + p * (w + 40)); if (tph * avg > best[1]) best = [m, tph * avg]; } return best; }
for (const t of ["lk_hell_p5", "lk_hell_p7"]) {
  const vals = decode(table(t)).map((items) => items.reduce((s, n) => s + val(RUNES.indexOf(n.replace(/ Rune$/, ""))), 0));
  console.log(`\n${t}: count of chest seeds holding each rune (unlocked)`);
  const by = {}; decode(table(t)).forEach((items) => new Set(items).forEach((n) => { const r = n.replace(/ Rune$/, ""); if (RUNES.indexOf(r) >= PUL) by[r] = (by[r] ?? 0) + 1; }));
  console.log(RUNES.slice(PUL).map((r) => `${r}:${by[r] ?? 0}`).join("  "));
  for (const th of [1, 0.5, 0.25, 0.125]) {
    const picked = vals.filter((x) => x >= th), d = picked.length / N, avg = picked.reduce((a, b) => a + b, 0) / picked.length;
    const [cap, bph] = perHour(d, avg);
    console.log(`hunt targets worth ≥ ${th} Ber: ${picked.length} seeds, avg ${avg.toFixed(2)} Ber → best cap ${cap} min, ${(bph * hit).toFixed(3)} Ber-equivalents/h at ${hit * 100}% hit`);
  }
}
