import { RunLog } from "./runLog";

let log: RunLog | undefined;

/**
 * The page-wide run log, shared by the Refine page (which writes to it) and the Stats page.
 * Created on first use so main.ts can restore browser storage from disk first.
 */
export function sharedRunLog(): RunLog {
  return (log ??= new RunLog());
}
