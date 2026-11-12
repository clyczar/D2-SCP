import type { PlayerProgress } from "./progress";
import type { RunLog } from "../stats/runLog";

// On the local dev server only, mirror browser storage to local-data/*.json (see scripts/viteBotBridge.ts),
// so a night of bot runs survives cleared browser data and can move to another PC with the folder.
const PROGRESS_KEY = "d2lkscp-progress";
const RUN_LOG_KEY = "d2scp-run-log";
const SAVE_DELAY_MS = 2000;

/** Before the app loads: fill empty browser storage from the disk copy, if there is one. */
export async function restoreFromDisk(): Promise<void> {
  if (!import.meta.hot) return;
  for (const [key, name] of [[PROGRESS_KEY, "progress"], [RUN_LOG_KEY, "run-log"]] as const) {
    try {
      if (localStorage.getItem(key) !== null) continue;
      const response = await fetch(`/__bot/load?name=${name}`);
      if (response.ok) localStorage.setItem(key, await response.text());
    } catch {
      // No backup or storage blocked: start fresh.
    }
  }
}

export function backUpToDisk(progress: PlayerProgress, runLog: RunLog): void {
  if (!import.meta.hot) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const [key, name] of [[PROGRESS_KEY, "progress"], [RUN_LOG_KEY, "run-log"]] as const) {
        let body: string | null = null;
        try {
          body = localStorage.getItem(key);
        } catch {
          return;
        }
        if (body !== null) void fetch(`/__bot/save?name=${name}`, { method: "POST", body }).catch(() => {});
      }
    }, SAVE_DELAY_MS);
  };
  progress.subscribe(save);
  runLog.subscribe(save);
  save();
}
