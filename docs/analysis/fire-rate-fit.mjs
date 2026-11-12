// Fits first-chest draw against RoF wait seconds from the 2026-11-12 history export (values copied in below).
const fit = (pts) => {
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const b = sxy / sxx, a = my - b * mx;
  const res = pts.map(([x, y]) => y - (a + b * x));
  const sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (n - 2));
  const seB = sd / Math.sqrt(sxx);
  return { n, intercept: +a.toFixed(1), slope: +b.toFixed(4), slopeSE: +seB.toFixed(4), residualSD: +sd.toFixed(1), res: res.map((r) => +r.toFixed(1)) };
};
// [wait seconds, actual draw of first chest]
const targeted = [[156.8,333],[153.0,345],[52.5,189],[133.8,298],[147.6,317],[178.7,383],[216.6,445],[262.0,519],[32.7,151],[82.0,239]];
const fireTest = [[120,301]];
const roF = [[0,98],[0,112],[0,113],[0,103]];
console.log("targeted only:", fit(targeted));
console.log("targeted + 120s test + RoF baseline:", fit([...targeted, ...fireTest, ...roF]));
console.log("merc present only:", fit([...targeted.slice(0,8), ...fireTest, ...roF]));
// normal tests: delta vs wait at rate 1.5625
const normal = [[23.7,-9],[56.4,-6],[66.6,2],[131.9,-5],[291.9,-2],[510.8,-13],[23.7,4]];
const f = fit(normal); console.log("normal delta vs wait:", f, "implied rate", (1.5625 + f.slope).toFixed(3));
