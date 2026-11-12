import type { Feature } from "../../app/feature";
import { ITEMS } from "../../data/items";
import { GRID_COLUMNS, GRID_ROWS } from "../../gamble/layout";
import { gamblePool } from "../../gamble/pool";
import { generateWindow, type GambleItem } from "../../gamble/window";
import type { SampleMeta } from "../../live/samples";
import { Rng } from "../../rng/rng";
import { button, el } from "../../ui/dom";

// Dev tool for building gamble-window recognition templates from samples/ (saved by the Run page while
// the Live page captures). Mark the grid once; every sample's seed then labels all 14 item cells, and
// "Save templates" crops each item into src/data/templates/<code>.png for the recogniser to use.

/** The 10×10 gamble grid's outer corners in frame pixels. */
export interface WindowGeometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  frameWidth: number;
  frameHeight: number;
}

const GEOMETRY_NAME = "window-geometry";
const INSET = 2;

type Corner = "topLeft" | "bottomRight";

export const samples: Feature = {
  id: "samples",
  title: "Samples",
  summary: "Label gamble-window frames and cut item templates for recognition (dev only).",
  ready: true,
  createPage() {
    const status = el("p", { className: "lead" });
    const canvas = el("canvas", { className: "sample-canvas" });
    const info = el("p", { className: "hint" });
    const list = el("p", { className: "hint" });
    let ids: string[] = [];
    let index = 0;
    let image: HTMLImageElement | null = null;
    let meta: SampleMeta | null = null;
    let items: GambleItem[] = [];
    let geometry: WindowGeometry | null = null;
    let marking: Corner | null = null;

    const markButton = (corner: Corner, label: string) =>
      button(label, () => {
        marking = corner;
        status.className = "lead";
        status.textContent = corner === "topLeft" ? "Click the top-left corner of the grid's first cell." : "Click the bottom-right corner of the grid's last cell.";
      }, "small");

    async function load(): Promise<void> {
      if (!import.meta.hot) {
        status.textContent = "This tool runs on the local dev server only (npm run dev).";
        return;
      }
      ids = await (await fetch("/__bot/sample-list")).json();
      const saved = await fetch(`/__bot/template?name=${GEOMETRY_NAME}&kind=json`);
      geometry = saved.ok ? await saved.json() : null;
      list.textContent = `${ids.length} samples in samples/.`;
      if (ids.length === 0) {
        status.textContent = "No samples yet. Start the capture on the Live page, then search a seed on the Run page with the gamble window open.";
        return;
      }
      await show(Math.min(index, ids.length - 1));
    }

    async function show(next: number): Promise<void> {
      index = (next + ids.length) % ids.length;
      const id = ids[index];
      meta = await (await fetch(`/__bot/sample?id=${id}&kind=json`)).json();
      image = await loadImage(`/__bot/sample?id=${id}&kind=png`);
      const { charLevel, poolOrder, rowPool } = meta!.params;
      items = generateWindow(Rng.fromSeed(meta!.storeSeed), charLevel, gamblePool(poolOrder, rowPool)).filter((item) => item.x >= 0);
      info.textContent = `Sample ${index + 1}/${ids.length}: ${id} · store seed ${meta!.storeSeed} · level ${charLevel}, ${poolOrder}${rowPool ? ", RotW" : ""} · ${items.length} items · frame ${image.naturalWidth}×${image.naturalHeight}`;
      status.className = "lead";
      status.textContent = geometry
        ? "Check every box sits on its item. If they're off, mark the grid again."
        : "Mark the grid: set its top-left and bottom-right corners on the frame.";
      draw();
    }

    function cellRect(item: GambleItem): [number, number, number, number] {
      const g = geometry!;
      const cw = (g.right - g.left) / GRID_COLUMNS;
      const ch = (g.bottom - g.top) / GRID_ROWS;
      const { width, height } = ITEMS[item.base];
      return [g.left + item.x * cw, g.top + item.y * ch, width * cw, height * ch];
    }

    function draw(): void {
      if (!image) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      if (!geometry) return;
      ctx.lineWidth = 2;
      ctx.font = "14px system-ui, sans-serif";
      ctx.strokeStyle = "rgb(76 195 76 / 70%)";
      ctx.strokeRect(geometry.left, geometry.top, geometry.right - geometry.left, geometry.bottom - geometry.top);
      for (const item of items) {
        const [x, y, w, h] = cellRect(item);
        ctx.strokeStyle = "#e5484d";
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgb(0 0 0 / 70%)";
        ctx.fillRect(x, y, Math.min(w, ctx.measureText(ITEMS[item.base].name).width + 6), 18);
        ctx.fillStyle = "#f5f1ea";
        ctx.fillText(ITEMS[item.base].name, x + 3, y + 14);
      }
    }

    canvas.addEventListener("click", (event) => {
      if (!marking || !image) return;
      const box = canvas.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * canvas.width;
      const py = ((event.clientY - box.top) / box.height) * canvas.height;
      const base = geometry ?? { left: px, top: py, right: px + 1, bottom: py + 1, frameWidth: canvas.width, frameHeight: canvas.height };
      geometry =
        marking === "topLeft"
          ? { ...base, left: px, top: py, frameWidth: canvas.width, frameHeight: canvas.height }
          : { ...base, right: px, bottom: py, frameWidth: canvas.width, frameHeight: canvas.height };
      marking = null;
      status.textContent = "Grid marked. Save it once the boxes line up.";
      draw();
    });

    async function saveGeometry(): Promise<void> {
      if (!geometry) return;
      const rounded = Object.fromEntries(Object.entries(geometry).map(([k, v]) => [k, Math.round(v * 10) / 10]));
      await post(GEOMETRY_NAME, "json", JSON.stringify(rounded, null, 2));
      status.className = "lead success";
      status.textContent = "Saved the grid to src/data/templates/window-geometry.json.";
    }

    async function saveTemplates(): Promise<void> {
      if (!geometry || !image) return;
      let saved = 0;
      for (const item of items) {
        const [x, y, w, h] = cellRect(item);
        const crop = el("canvas", { width: Math.round(w - 2 * INSET), height: Math.round(h - 2 * INSET) });
        crop.getContext("2d")!.drawImage(image, x + INSET, y + INSET, w - 2 * INSET, h - 2 * INSET, 0, 0, crop.width, crop.height);
        const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, "image/png"));
        if (blob && (await post(ITEMS[item.base].code, "png", blob))) saved++;
      }
      status.className = "lead success";
      status.textContent = `Saved ${saved} item templates to src/data/templates/.`;
    }

    void load();
    return {
      root: el(
        "div",
        { className: "page" },
        el(
          "section",
          { className: "panel" },
          el("div", { className: "panel-head" }, el("h2", { textContent: "Recognition samples" })),
          status,
          el(
            "div",
            { className: "live-controls" },
            button("◀ Previous", () => void show(index - 1), "small"),
            button("Next ▶", () => void show(index + 1), "small"),
            markButton("topLeft", "Set grid top-left"),
            markButton("bottomRight", "Set grid bottom-right"),
            button("Save grid", () => void saveGeometry(), "small"),
            button("Save templates from this sample", () => void saveTemplates(), "primary"),
            button("Reload", () => void load(), "small"),
          ),
          info,
          canvas,
          list,
        ),
      ),
      onShow: () => void load(),
    };
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

async function post(name: string, kind: "png" | "json", body: Blob | string): Promise<boolean> {
  try {
    return (await fetch(`/__bot/template?name=${encodeURIComponent(name)}&kind=${kind}`, { method: "POST", body })).ok;
  } catch {
    return false;
  }
}
