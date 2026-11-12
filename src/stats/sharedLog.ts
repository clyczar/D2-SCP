import { RunLog } from "./runLog";

/** The page-wide run log, shared by the Refine page (which writes to it) and the Stats page. */
export const runLog = new RunLog();
