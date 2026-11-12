import { profileStorage } from "../app/profiles";
import { RunLog } from "./runLog";

let log: RunLog | undefined;

/**
 * The page-wide run log, shared by the Refine page (which writes to it) and the Stats page.
 * Created on first use so main.ts can restore browser storage from disk first. Scoped to the active profile.
 */
export function sharedRunLog(): RunLog {
  return (log ??= new RunLog(profileStorage()));
}
