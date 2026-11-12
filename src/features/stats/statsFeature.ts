import type { Feature } from "../../app/feature";
import type { PlayerProgress } from "../../app/progress";
import { chestArea, CHEST_AREAS } from "../../chest/areas";
import { routeName, type RouteSample } from "../../chest/waypoints";
import { histogram, linearFit, mean, rolling, standardDeviation, summariseRuns, type RunSummary } from "../../stats/analysis";
import { parseRunLogFile, type RunRecord } from "../../stats/runLog";
import { sharedRunLog } from "../../stats/sharedLog";
import { barChart, scatterChart } from "../../ui/charts";
import { button, choiceTabs, el, field } from "../../ui/dom";
import { plural } from "../../ui/format";

const WINDOWS = [10, 25, 50] as const;
const NEAR = 5;

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const percent = (n: number) => `${Math.round(n * 100)}%`;

function tile(label: string, value: string, detail: string): HTMLElement {
  return el(
    "div",
    { className: "stat-tile" },
    el("span", { className: "stat-label", textContent: label }),
    el("strong", { className: "stat-value", textContent: value }),
    el("span", { className: "stat-detail", textContent: detail }),
  );
}

function panel(title: string, lead: string, ...body: (Node | string)[]): HTMLElement {
  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: title })),
    el("p", { className: "lead", textContent: lead }),
    ...body,
  );
}

function runTip(run: RunSummary): string {
  const r = run.first;
  const parts = [`Run ${run.index}`, `first chest ${signed(r.delta!, 0)} draws`];
  if (r.rune) parts.push(r.rune);
  if (r.wait !== null) parts.push(`waited ${Math.round(r.wait)} s`);
  if (run.hit) parts.push(run.hitChest === 1 ? "hit" : `hit on chest ${run.hitChest}`);
  return parts.join(" · ");
}

/** First-chest draws against wait seconds, plus the River of Flame route samples as zero-wait points. */
function firePoints(records: readonly RunRecord[], riverSamples: readonly RouteSample[]) {
  const timed = records
    .filter((r) => !r.excluded && r.chest === 1 && r.wait !== null && r.actualDraw !== null)
    .map((r) => ({ x: r.wait!, y: r.actualDraw!, tip: `waited ${Math.round(r.wait!)} s → draw ${r.actualDraw}${r.note ? ` (${r.note})` : ""}` }));
  const river = riverSamples.map((s) => ({ x: 0, y: s.draw, tip: `River of Flame calibration: draw ${s.draw}` }));
  return [...timed, ...river];
}

function calibrationTable(progress: PlayerProgress): HTMLElement {
  const rows = CHEST_AREAS.flatMap(({ id }) => {
    const byRoute = new Map<string, number[]>();
    for (const s of progress.routeSamplesIn(id)) {
      if (s.preset) continue;
      byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s.draw]);
    }
    return [...byRoute].map(([route, draws]) => {
      const sd = standardDeviation(draws);
      return el(
        "tr",
        {},
        el("td", { textContent: `${chestArea(id).short} · ${routeName(route as RouteSample["route"])}` }),
        el("td", { textContent: String(draws.length) }),
        el("td", { textContent: mean(draws)!.toFixed(1) }),
        el("td", { textContent: sd === null ? "–" : `±${sd.toFixed(1)}` }),
        el("td", { className: "muted", textContent: draws.join(", ") }),
      );
    });
  });
  if (rows.length === 0) return el("p", { className: "chart-empty", textContent: "No calibration samples yet. Measure routes on the Calibrate page." });
  return el(
    "div",
    { className: "table-scroll" },
    el(
      "table",
      { className: "stats-table" },
      el("thead", {}, el("tr", {}, ...["Route", "Samples", "Mean draw", "Spread", "Draws"].map((h) => el("th", { textContent: h })))),
      el("tbody", {}, ...rows),
    ),
  );
}

function recordsTable(records: readonly RunRecord[]): HTMLElement {
  if (records.length === 0) return el("p", { className: "chart-empty", textContent: "No runs logged yet." });
  const rows = [...records].reverse().map((r) => {
    const exclude = el("input", { type: "checkbox", checked: r.excluded, title: "Leave this chest out of every chart" });
    exclude.addEventListener("change", () => sharedRunLog().setExcluded(r.id, exclude.checked));
    return el(
      "tr",
      { className: r.excluded ? "excluded" : "" },
      el("td", { textContent: r.at > 1e12 ? new Date(r.at).toLocaleString() : r.runId.replace(/^history:/, "") }),
      el("td", { textContent: r.rune ?? "–" }),
      el("td", { textContent: String(r.chest) }),
      el("td", { textContent: r.targetDraw === null ? "–" : String(r.targetDraw) }),
      el("td", { textContent: r.actualDraw === null ? "–" : String(r.actualDraw) }),
      el("td", { textContent: r.delta === null ? "–" : signed(r.delta, 0) }),
      el("td", { textContent: r.wait === null ? "–" : `${Math.round(r.wait)} s` }),
      el("td", {}, el("label", { className: "check" }, exclude, "Exclude")),
      el("td", {}, button("Delete", () => sharedRunLog().remove(r.id), "small")),
    );
  });
  return el(
    "div",
    { className: "table-scroll" },
    el(
      "table",
      { className: "stats-table" },
      el("thead", {}, el("tr", {}, ...["Run", "Rune", "Chest", "Target", "Actual", "Off by", "Wait", "", ""].map((h) => el("th", { textContent: h })))),
      el("tbody", {}, ...rows),
    ),
  );
}

function fileControls(): HTMLElement {
  const status = el("span", { className: "hint" });
  const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    const records = parseRunLogFile(await chosen.text());
    if (!records) {
      status.textContent = "That file isn't a run log or an opening history export.";
      return;
    }
    const added = sharedRunLog().merge(records);
    status.textContent = `Imported ${plural(records.length, "chest")}, ${added} new.`;
  });
  const exportLog = button("Export runs", () => {
    const link = el("a", {
      href: URL.createObjectURL(new Blob([sharedRunLog().exportJson()], { type: "application/json" })),
      download: `d2scp-run-log-${new Date().toISOString().slice(0, 10)}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
  }, "small");
  return el("div", { className: "step-footer" }, button("Import runs", () => file.click(), "small primary"), exportLog, file, status);
}

export const stats: Feature = {
  id: "stats",
  title: "Stats",
  summary: "See whether your chests are landing closer to plan over time.",
  ready: true,
  createPage(progress) {
    let window: (typeof WINDOWS)[number] = 10;
    const body = el("div", { className: "page" });

    function render(): void {
      const records = sharedRunLog().all;
      const runs = summariseRuns(records);
      const deltas = runs.map((r) => r.first.delta!);
      const hits = runs.filter((r) => r.hit).length;
      const sd = standardDeviation(deltas);
      const bias = mean(deltas);
      const fit = linearFit(firePoints(records, progress.routeSamplesIn("lowerKurast").filter((s) => s.route === "riverOfFlame")));
      const fireSetting = progress.settings.fireRate;

      const tiles = el(
        "div",
        { className: "stat-tiles" },
        tile("Runs", String(runs.length), `${plural(records.length, "chest")} logged`),
        tile("Hit rate", runs.length ? percent(hits / runs.length) : "–", `${plural(hits, "run")} landed on plan`),
        tile("Spread", sd === null ? "–" : `±${sd.toFixed(1)}`, "draws, first chest"),
        tile("Bias", bias === null ? "–" : signed(bias), bias === null ? "draws" : bias < 0 ? "draws early on average" : "draws late on average"),
        tile("Fire rate", fit ? fit.slope.toFixed(3) : "–", fit ? `±${fit.slopeSE.toFixed(3)} /s fitted${fireSetting ? `, using ${fireSetting}` : ""}` : "needs 3 timed runs"),
      );

      const everyRun = scatterChart({
        points: runs.map((run) => ({ x: run.index, y: run.first.delta!, tip: runTip(run), kind: run.hit ? "hit" : "miss" })),
        x: { label: "Run" },
        y: { label: "Draws off (first chest)", format: (v) => signed(v, 0), include: [0] },
        zeroBand: NEAR,
        empty: "Import your history or log a run from the Refine page to start.",
      });

      const trend = rolling(runs, Math.min(window, Math.max(1, runs.length)));
      const enough = runs.length >= window;
      const hitTrend = scatterChart({
        points: enough ? trend.map((p) => ({ x: p.index, y: p.hitRate * 100, tip: `Runs ${p.index - window + 1}–${p.index}: ${percent(p.hitRate)} hit` })) : [],
        x: { label: "Run" },
        y: { label: "Hit rate %", include: [0] },
        connect: true,
        empty: `Needs ${window} runs to draw a trend (${runs.length} so far).`,
      });
      const spreadTrend = scatterChart({
        points: enough ? trend.filter((p) => p.sd !== null).map((p) => ({ x: p.index, y: p.sd!, tip: `Runs ${p.index - window + 1}–${p.index}: ±${p.sd!.toFixed(1)} draws` })) : [],
        x: { label: "Run" },
        y: { label: "Spread ± draws", include: [0] },
        connect: true,
        empty: `Needs ${window} runs to draw a trend (${runs.length} so far).`,
      });
      const windowTabs = choiceTabs(WINDOWS.map((w) => ({ id: w, label: `Last ${w}` })), window, (w) => {
        window = w;
        render();
      });

      const bins = histogram(deltas, 2);
      const distribution = barChart({
        bars: bins.map((b) => ({
          label: signed((b.from + b.to) / 2, 0),
          value: b.count,
          tip: `${signed(b.from + 0.5, 0)} to ${signed(b.to - 0.5, 0)} draws: ${plural(b.count, "run")}`,
          emphasis: b.from < 0 && b.to > 0,
        })),
        x: { label: "Draws off (first chest), 2-draw bins" },
        y: { label: "Runs" },
        empty: "No runs yet.",
      });

      const fire = scatterChart({
        points: firePoints(records, progress.routeSamplesIn("lowerKurast").filter((s) => s.route === "riverOfFlame")),
        x: { label: "Seconds waited at River of Flame", include: [0] },
        y: { label: "First chest draw" },
        line: fit ?? undefined,
        empty: "Needs runs with a wait time and an actual draw.",
      });
      const fireLead = fit
        ? `Draw ≈ ${fit.intercept.toFixed(1)} + ${fit.slope.toFixed(3)} × seconds waited (${fit.n} points). The slope is your fire rate, ±${fit.slopeSE.toFixed(3)}. Points still scatter about ±${fit.residualSD.toFixed(1)} draws around the line: that's the per-run noise a better fire rate can't remove.`
        : "Once there are 3 runs with a wait time and an actual draw, this fits your fire rate from them.";

      body.replaceChildren(
        el(
          "section",
          { className: "panel" },
          el("div", { className: "panel-head" }, el("h2", { textContent: "Accuracy" })),
          el("p", { className: "lead", textContent: "How close your first chest lands to the planned draw. Runs logged on the Refine page and imported history both count; untick a run below to leave it out." }),
          tiles,
          fileControls(),
        ),
        panel(
          "Every run",
          `Each dot is one game's first chest: 0 is on plan, the shaded band is within ${NEAR} draws. Filled dots are runs that hit, on any chest.`,
          everyRun,
          el("p", { className: "chart-legend" }, el("span", { className: "legend-hit", textContent: "● Hit" }), el("span", { className: "legend-miss", textContent: "○ Miss" })),
        ),
        panel("Getting better?", "Hit rate and spread over a trailing window of runs. A rising hit rate and a falling spread mean the routine is getting more consistent.", field("Window", windowTabs), hitTrend, spreadTrend),
        panel("Early or late?", bias === null ? "How the first-chest misses spread out." : `How the first-chest misses spread out. On average you land ${Math.abs(bias).toFixed(1)} draws ${bias < 0 ? "early" : "late"}.`, distribution),
        panel("Fire rate", fireLead, fire),
        panel("Calibration samples", "Route draws measured on the Calibrate page, per area.", calibrationTable(progress)),
        panel("Logged chests", "Newest first. Exclude a chest that was a misread or an interrupted run so it doesn't skew the charts.", recordsTable(records)),
      );
    }

    sharedRunLog().subscribe(render);
    progress.subscribe(render);
    render();
    return { root: body, onShow: render };
  },
};
