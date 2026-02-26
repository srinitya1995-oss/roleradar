/**
 * Settings defaults. Location gate and reject-bucket logic use these.
 */

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
  "Remote",
  "Seattle, WA",
  "San Francisco, CA",
  "Los Angeles, CA",
];

export const defaultShowRejectBucket = true;
export const defaultRejectCpiMinToShow = 5;
export const defaultRejectCpiMaxToShow = 6;
export const defaultRejectMustHaveAnyKeywords: string[] = [
  "genai",
  "gen ai",
  "generative ai",
  "llm",
  "large language",
  "copilot",
  "agent",
  "agents",
];

export const defaultMaxTargetsPerJob = 3;

export type Settings = {
  allowed_locations: string[];
  show_reject_bucket: boolean;
  reject_cpi_min_to_show: number;
  reject_cpi_max_to_show: number;
  reject_must_have_any_keywords: string[];
  max_targets_per_job: number;
};

export function getSettings(): Settings {
  return {
    allowed_locations: defaultAllowedLocations,
    show_reject_bucket: defaultShowRejectBucket,
    reject_cpi_min_to_show: defaultRejectCpiMinToShow,
    reject_cpi_max_to_show: defaultRejectCpiMaxToShow,
    reject_must_have_any_keywords: defaultRejectMustHaveAnyKeywords,
    max_targets_per_job: defaultMaxTargetsPerJob,
  };
}

/** True if location matches any allowed_locations (case-insensitive substring). */
export function locationMatchesAllowed(location: string | null | undefined, allowed: string[]): boolean {
  const loc = (location ?? "").trim();
  if (!loc) return false;
  const lower = loc.toLowerCase();
  return allowed.some((a) => a.trim().toLowerCase() && lower.includes(a.trim().toLowerCase()));
}

/** True if title or description contains at least one keyword (case-insensitive). */
export function matchesRejectKeywords(
  title: string | null | undefined,
  description: string | null | undefined,
  keywords: string[]
): boolean {
  const text = [title ?? "", description ?? ""].join(" ").toLowerCase();
  return keywords.some((k) => k.trim().toLowerCase() && text.includes(k.trim().toLowerCase()));
}
