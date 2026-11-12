// Counts chest seeds per area/player table whose drop holds each rune tier or better. Run: node docs/analysis/rune-odds.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const table = (name) => fileURLToPath(new URL(`../../src/data/${name}.bin`, import.meta.url));
const RUNES = ["El","Eld","Tir","Nef","Eth","Ith","Tal","Ral","Ort","Thul","Amn","Sol","Shael","Dol","Hel","Io","Lum","Ko","Fal","Lem","Pul","Um","Mal","Ist","Gul","Vex","Ohm","Lo","Sur","Ber","Jah","Cham","Zod"];
const rank = new Map(RUNES.map((r, i) => [r + " Rune", i]));
function decode(path) {
  const b = readFileSync(path), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.subarray(0, 4).toString() !== "LKSC") throw new Error("bad file");
  const nameBytes = v.getUint32(7, true); let at = 11;
  const names = b.subarray(at, at + nameBytes).toString("utf8").split("\n"); at += nameBytes;
  const seeds = v.getUint16(at, true); at += 2;
  const out = [];
  for (let s = 0; s < seeds; s++) {
    const unlocked = b[at++], locked = b[at++]; const cycles = [];
    for (let c = 0; c < locked; c++) { const size = b[at++]; const cyc = [];
      for (let i = 0; i < size; i++) { const f = b[at++]; cyc.push(names[f < 0x80 ? f : ((f & 0x7f) << 8) | b[at++]]); }
      cycles.push(cyc); }
    out.push({ unlocked, cycles });
  }
  return out;
}
const best = (items) => items.reduce((m, n) => Math.max(m, rank.get(n) ?? -1), -1);
const TH = ["Pul","Ist","Vex","Ohm","Lo","Ber","Jah","Cham","Zod"];
const rows = [];
for (const area of ["lk", "rof"]) for (const p of [1, 3, 5, 7]) {
  const t = decode(table(`${area}_hell_p${p}`));
  for (const lock of ["unlocked", "locked"]) {
    const bests = t.map(({ unlocked, cycles }) => best(cycles.slice(0, lock === "unlocked" ? unlocked : cycles.length).flat()));
    const row = { table: `${area.toUpperCase()} p${p} ${lock}` };
    for (const r of TH) row["≥" + r] = bests.filter((x) => x >= RUNES.indexOf(r)).length;
    rows.push(row);
  }
}
console.table(rows);
