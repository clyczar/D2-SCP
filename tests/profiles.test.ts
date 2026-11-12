import { describe, expect, it } from "vitest";
import { PlayerProgress } from "../src/app/progress";
import {
  activeProfile,
  addProfile,
  DEFAULT_PROFILE,
  keyInProfile,
  profileFileSuffix,
  profileNames,
  profileStorage,
  removeProfile,
  setActiveProfile,
} from "../src/app/profiles";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe("profiles", () => {
  it("starts on the default profile and lists new ones after it", () => {
    const base = memoryStorage();
    expect(activeProfile(base)).toBe(DEFAULT_PROFILE);
    expect(addProfile("  RoF   Sorc ", base)).toBe("RoF Sorc");
    expect(addProfile("bad@name", base)).toBeNull();
    expect(profileNames(base)).toEqual([DEFAULT_PROFILE, "RoF Sorc"]);
  });

  it("keeps each profile's progress apart and leaves the default on the original keys", () => {
    const base = memoryStorage();
    addProfile("RoF Sorc", base);
    new PlayerProgress(profileStorage(base, DEFAULT_PROFILE)).setCharLevel(83);
    setActiveProfile("RoF Sorc", base);
    const rof = new PlayerProgress(profileStorage(base));
    expect(rof.charLevel).toBeNull();
    rof.setCharLevel(90);
    expect(new PlayerProgress(profileStorage(base, DEFAULT_PROFILE)).charLevel).toBe(83);
    expect(new PlayerProgress(profileStorage(base, "RoF Sorc")).charLevel).toBe(90);
    expect(base.data.has("d2lkscp-progress")).toBe(true);
    expect(base.data.has("d2lkscp-progress@RoF Sorc")).toBe(true);
  });

  it("removing the active profile falls back to the default", () => {
    const base = memoryStorage();
    addProfile("Alt", base);
    setActiveProfile("Alt", base);
    removeProfile("Alt", base);
    expect(activeProfile(base)).toBe(DEFAULT_PROFILE);
    expect(profileNames(base)).toEqual([DEFAULT_PROFILE]);
  });

  it("scopes keys and file names per profile", () => {
    expect(keyInProfile("d2lkscp-progress", DEFAULT_PROFILE)).toBe(true);
    expect(keyInProfile("d2lkscp-progress@Alt", DEFAULT_PROFILE)).toBe(false);
    expect(keyInProfile("d2lkscp-progress@Alt", "Alt")).toBe(true);
    expect(profileFileSuffix(DEFAULT_PROFILE)).toBe("");
    expect(profileFileSuffix("RoF Sorc!")).toBe("-p-rof-sorc");
  });
});
