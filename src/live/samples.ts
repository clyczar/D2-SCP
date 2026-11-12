import type { SearchParams } from "../search/protocol";

// Training samples for gamble-window recognition: a capture-card frame taken while the window was on screen,
// saved with the store seed the search found. The seed regenerates all 14 items and their cells
// (src/gamble/window.ts generateWindow), so each sample labels every cell without manual tagging.

export interface SampleMeta {
  storeSeed: number;
  gameSeeds: number[];
  params: SearchParams;
  capturedAt: number;
}

/** Saves a frame and its labels to samples/ on the dev server; a no-op on the built site. */
export async function saveSample(frame: Promise<Blob | null>, meta: SampleMeta): Promise<boolean> {
  if (!import.meta.hot) return false;
  const blob = await frame;
  if (!blob) return false;
  const id = `${new Date(meta.capturedAt).toISOString().replace(/[:.]/g, "-")}-${meta.storeSeed}`;
  try {
    const png = await fetch(`/__bot/sample?id=${id}&kind=png`, { method: "POST", body: blob });
    const json = await fetch(`/__bot/sample?id=${id}&kind=json`, { method: "POST", body: JSON.stringify(meta, null, 2) });
    return png.ok && json.ok;
  } catch {
    return false;
  }
}
