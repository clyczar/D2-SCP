import { activeProfile, profileFileSuffix, profileKey } from "./profiles";
import type { PlayerProgress } from "./progress";
import type { RunLog } from "../stats/runLog";

// On the local dev server only, mirror browser storage to local-data/*.json (see scripts/viteBotBridge.ts),
// so a night of bot runs survives cleared browser data and can move to another PC with the folder.
const PROGRESS_KEY = "d2lkscp-progress";
const RUN_LOG_KEY = "d2scp-run-log";
const SAVE_DELAY_MS = 2000;

/** Storage key and backup file name of each mirrored item, for a profile. */
function items(profile = activeProfile()): [key: string, name: string][] {
  const suffix = profileFileSuffix(profile);
  return [
    [profileKey(PROGRESS_KEY, profile), `progress${suffix}`],
    [profileKey(RUN_LOG_KEY, profile), `run-log${suffix}`],
  ];
}

/** Deletes a profile's backup files, so clearing its data isn't undone by the next restore. */
export async function deleteDiskBackup(profile: string): Promise<void> {
  if (!import.meta.hot) return;
  await Promise.all(items(profile).map(([, name]) => fetch(`/__bot/save?name=${name}`, { method: "DELETE" }).catch(() => {})));
}

/** Before the app loads: fill empty browser storage from the disk copy, if there is one. */
export async function restoreFromDisk(): Promise<void> {
  if (!import.meta.hot) return;
  for (const [key, name] of items()) {
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
      for (const [key, name] of items()) {
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
