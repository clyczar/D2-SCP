import { backUpToDisk, restoreFromDisk } from "./app/diskBackup";
import { FEATURES } from "./app/features";
import { PlayerProgress } from "./app/progress";
import { mountShell } from "./app/shell";
import { sharedRunLog } from "./stats/sharedLog";
import "./style.css";

await restoreFromDisk();
const progress = new PlayerProgress();
backUpToDisk(progress, sharedRunLog());
mountShell(document.querySelector("#app")!, FEATURES, progress);
