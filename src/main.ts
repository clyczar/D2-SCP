import { backUpToDisk, restoreFromDisk } from "./app/diskBackup";
import { FEATURES } from "./app/features";
import { profileStorage } from "./app/profiles";
import { PlayerProgress } from "./app/progress";
import { mountShell } from "./app/shell";
import { sharedRunLog } from "./stats/sharedLog";
import "./style.css";

await restoreFromDisk();
const progress = new PlayerProgress(profileStorage());
backUpToDisk(progress, sharedRunLog());
mountShell(document.querySelector("#app")!, FEATURES, progress);
