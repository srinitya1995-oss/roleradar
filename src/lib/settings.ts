/**
 * Settings: precedence env > settings.json > defaults.
 * Canonical: recency_days (21), CA + Seattle only, no remote-only unless allow_remote.
 */

import * as fs from "fs";
import * as path from "path";

export const defaultRecencyDays = 21;
export const defaultAllowedLocations: string[] = [
  "CA",
  "California",
  "Seattle",
  "San Francisco",
  "SF",
  "Los Angeles",
  "LA",
  "Bellevue",
  "Redmond",
  "Seattle, WA",
  "San Francisco, CA",
  "Los Angeles, CA",
  "Bellevue, WA",
  "Redmond, WA",
  "Remote",
  "United States",
  "USA",
  "US",
  "New York",
  "NYC",
  "Boston",
  "Austin",
  "Denver",
];

export const defaultAllowRemote = false;
export const defaultAllowGpm = false;
export const defaultAllowJuniorPm = false;
export const defaultShowRejectBucket = true;
export const defaultRejectCpiMinToShow = 5;
export const defaultRejectCpiMaxToShow = 6;

export const defaultMaxTargetsPerJob = 4;
export const defaultTargetStaleDays = 14;
export const defaultPrewarmCap = 20;

export type Settings = {
  recency_days: number;
  allowed_locations: string[];
  allow_remote: boolean;
  allow_gpm: boolean;
  allow_junior_pm: boolean;
  show_reject_bucket: boolean;
  reject_cpi_min_to_show: number;
  reject_cpi_max_to_show: number;
  max_targets_per_job: number;
  target_stale_days: number;
  prewarm_cap: number;
};

type SettingsFile = Partial<{
  recency_days: number;
  allow_remote: boolean;
  allow_gpm: boolean;
  allow_junior_pm: boolean;
  target_stale_days: number;
  prewarm_cap: number;
  max_targets_per_job: number;
  allowed_locations: string[];
}>;

function loadSettingsFile(): SettingsFile | null {
  try {
    const p = path.join(process.cwd(), "settings.json");
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw) as SettingsFile;
    }
  } catch {
    // ignore
  }
  return null;
}

function envBool(key: string): boolean | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  return v.toLowerCase() === "true" || v === "1";
}

function envInt(key: string): number | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function envStringArray(key: string): string[] | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;

  const file = loadSettingsFile();

  const recency_days = envInt("RECENCY_DAYS") ?? file?.recency_days ?? defaultRecencyDays;
  const allow_remote = envBool("ALLOW_REMOTE") ?? file?.allow_remote ?? defaultAllowRemote;
  const allow_gpm = envBool("ALLOW_GPM") ?? file?.allow_gpm ?? defaultAllowGpm;
  const allow_junior_pm = envBool("ALLOW_JUNIOR_PM") ?? file?.allow_junior_pm ?? defaultAllowJuniorPm;
  const target_stale_days = envInt("TARGET_STALE_DAYS") ?? file?.target_stale_days ?? defaultTargetStaleDays;
  const prewarm_cap = envInt("PREWARM_CAP") ?? file?.prewarm_cap ?? defaultPrewarmCap;
  const max_targets_per_job = envInt("MAX_TARGETS_PER_JOB") ?? file?.max_targets_per_job ?? defaultMaxTargetsPerJob;
  const allowed_locations = envStringArray("ALLOWED_LOCATIONS") ?? file?.allowed_locations ?? defaultAllowedLocations;

  cached = {
    recency_days: Math.max(1, recency_days),
    allowed_locations: Array.isArray(allowed_locations) ? allowed_locations : defaultAllowedLocations,
    allow_remote: !!allow_remote,
    allow_gpm: !!allow_gpm,
    allow_junior_pm: !!allow_junior_pm,
    show_reject_bucket: defaultShowRejectBucket,
    reject_cpi_min_to_show: defaultRejectCpiMinToShow,
    reject_cpi_max_to_show: defaultRejectCpiMaxToShow,
    max_targets_per_job: Math.min(4, Math.max(1, max_targets_per_job)),
    target_stale_days: Math.max(1, target_stale_days),
    prewarm_cap: Math.max(1, prewarm_cap),
  };
  return cached;
}

/** True if location matches any allowed_locations (case-insensitive substring). Use locationEligible() for full policy. */
export function locationMatchesAllowed(location: string | null | undefined, allowed: string[]): boolean {
  const loc = (location ?? "").trim();
  if (!loc) return false;
  const lower = loc.toLowerCase();
  return allowed.some((a) => a.trim().toLowerCase() && lower.includes(a.trim().toLowerCase()));
}
