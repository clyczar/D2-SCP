// Character profiles: each keeps its own progress (settings, calibration, plans) and run log, so a
// Lower Kurast character and a River of Flame character don't share calibrations. The default profile
// uses the original storage keys; another profile suffixes them with "@<name>".

const PROFILES_KEY = "d2scp-profiles";
export const DEFAULT_PROFILE = "Main";
const MAX_NAME = 24;

interface Profiles {
  active: string;
  names: string[];
}

type KeyStore = Pick<Storage, "getItem" | "setItem">;

function read(base: KeyStore | undefined): Profiles {
  try {
    const parsed = JSON.parse(base?.getItem(PROFILES_KEY) ?? "null") as Partial<Profiles> | null;
    const names = Array.isArray(parsed?.names) ? parsed.names.filter((n): n is string => typeof n === "string" && n !== "") : [];
    const all = [DEFAULT_PROFILE, ...names.filter((n) => n !== DEFAULT_PROFILE)];
    return { active: all.includes(parsed?.active ?? "") ? parsed!.active! : DEFAULT_PROFILE, names: all };
  } catch {
    return { active: DEFAULT_PROFILE, names: [DEFAULT_PROFILE] };
  }
}

function write(profiles: Profiles, base: KeyStore | undefined): void {
  try {
    base?.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // Storage blocked: profiles last for this page only.
  }
}

export function profileNames(base: KeyStore | undefined = globalThis.localStorage): string[] {
  return read(base).names;
}

export function activeProfile(base: KeyStore | undefined = globalThis.localStorage): string {
  return read(base).active;
}

export function cleanProfileName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  return trimmed === "" || trimmed.includes("@") ? null : trimmed;
}

export function addProfile(name: string, base: KeyStore | undefined = globalThis.localStorage): string | null {
  const clean = cleanProfileName(name);
  if (!clean) return null;
  const profiles = read(base);
  if (!profiles.names.includes(clean)) profiles.names.push(clean);
  write(profiles, base);
  return clean;
}

export function setActiveProfile(name: string, base: KeyStore | undefined = globalThis.localStorage): void {
  const profiles = read(base);
  if (!profiles.names.includes(name)) return;
  write({ ...profiles, active: name }, base);
}

/** Forgets a profile (not the default) and switches back to the default; its data is cleared separately. */
export function removeProfile(name: string, base: KeyStore | undefined = globalThis.localStorage): void {
  if (name === DEFAULT_PROFILE) return;
  const profiles = read(base);
  write({ active: profiles.active === name ? DEFAULT_PROFILE : profiles.active, names: profiles.names.filter((n) => n !== name) }, base);
}

export function profileKey(key: string, profile: string): string {
  return profile === DEFAULT_PROFILE ? key : `${key}@${profile}`;
}

/** Whether a storage key belongs to the profile: its own "@name" keys, or the un-suffixed keys for the default. */
export function keyInProfile(key: string, profile: string): boolean {
  return profile === DEFAULT_PROFILE ? !key.includes("@") : key.endsWith(`@${profile}`);
}

/** A Storage view whose keys are scoped to the active profile. */
export function profileStorage(base: KeyStore | undefined = globalThis.localStorage, profile = activeProfile(base)): KeyStore {
  return {
    getItem: (key) => base?.getItem(profileKey(key, profile)) ?? null,
    setItem: (key, value) => base?.setItem(profileKey(key, profile), value),
  };
}

/** A file-name-safe suffix for the profile's disk backups: "" for the default. */
export function profileFileSuffix(profile: string): string {
  if (profile === DEFAULT_PROFILE) return "";
  const slug = profile.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
  return `-p-${slug || "profile"}`;
}
