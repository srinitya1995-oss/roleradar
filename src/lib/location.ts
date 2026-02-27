/**
 * Location normalization and policy. CA + Seattle + USA; no remote-only unless allow_remote.
 * Uses normalize() so "San Francisco, CA" matches allowed "CA" or "San Francisco".
 */

import { normalizeForMatch } from "./normalize";

export type LocationParse = {
  raw_location: string;
  is_remote: boolean;
  is_hybrid: boolean;
  /** True if location is only "Remote" / "Remote - US" / "Anywhere" with no city. */
  is_remote_only: boolean;
};

const REMOTE_ONLY_PATTERNS = [
  /^\s*remote\s*$/i,
  /^\s*remote\s*-\s*us\s*$/i,
  /^\s*us\s+remote\s*$/i,
  /^\s*anywhere\s*$/i,
  /^\s*remote\s*,\s*usa\s*$/i,
];

/** Normalize location string and detect remote/hybrid. */
export function parseLocation(location: string | null | undefined): LocationParse {
  const raw = (location ?? "").trim();
  const lower = raw.toLowerCase();
  const is_remote = lower.includes("remote") || lower.includes("anywhere");
  const is_hybrid = lower.includes("hybrid");
  const bayAreaAndSeattle =
    /\b(san francisco|sf|seattle|la|los angeles|bellevue|redmond|california|ca|los gatos|cupertino|mountain view|san jose|palo alto|menlo park|fremont)\b/i;
  const is_remote_only =
    REMOTE_ONLY_PATTERNS.some((p) => p.test(raw)) ||
    (is_remote && !is_hybrid && !bayAreaAndSeattle.test(raw));

  return { raw_location: raw, is_remote, is_hybrid, is_remote_only };
}

/** Out-of-area state/region markers: if location contains these and no CA/WA marker, reject. */
const OUT_OF_AREA_MARKERS = [
  /\bsc\b/i,           // South Carolina (Hilton Head Island, SC)
  /\b,\s*sc\s*$/i,
  /\bsouth carolina\b/i,
  /\bnc\b/i,            // North Carolina
  /\bnorth carolina\b/i,
  /\bny\b/i, /\bnew york\b/i,
  /\bma\b/i, /\bmassachusetts\b/i,
  /\btx\b/i, /\btexas\b/i,
  /\bco\b/i, /\bcolorado\b/i,
  /\bfl\b/i, /\bflorida\b/i,
  /\bga\b/i, /\bgeorgia\b/i,
];

/** In-area markers: CA or Seattle area. */
const IN_AREA_MARKERS = [
  /\bca\b/i, /\bcalifornia\b/i, /\bwa\b/i, /\bwashington\b/i,
  /\bsan francisco\b/i, /\bseattle\b/i, /\bbay area\b/i,
  /\blos angeles\b/i, /\bsf\b/i, /\bcupertino\b/i, /\bmountain view\b/i,
  /\bsan jose\b/i, /\bpalo alto\b/i, /\bmenlo park\b/i, /\bfremont\b/i, /\blos gatos\b/i, /\bbellevue\b/i, /\bredmond\b/i,
];

/**
 * Job is location-eligible if: (allowed city/state/country match) OR (remote-only and (allow_remote OR "Remote" in allowed list)).
 * Uses normalize() so job location "San Francisco, CA" passes when allowed has "CA" or "San Francisco".
 * Explicit pass: if API returns "United States" or "Remote", and that value is in allowed_locations, PASS (no city required).
 * Locations that clearly indicate another state (e.g. Hilton Head Island, SC) are rejected unless they also contain CA/WA.
 */
export function locationEligible(
  location: string | null | undefined,
  allowedLocations: string[],
  allowRemote: boolean
): boolean {
  const parsed = parseLocation(location);
  if (!parsed.raw_location) return true;

  const raw = parsed.raw_location;
  const hasOutOfArea = OUT_OF_AREA_MARKERS.some((re) => re.test(raw));
  const hasInArea = IN_AREA_MARKERS.some((re) => re.test(raw));
  if (hasOutOfArea && !hasInArea) return false;

  const normLocation = normalizeForMatch(location);
  const allowedNormSet = new Set(allowedLocations.map((a) => normalizeForMatch(a)).filter(Boolean));

  if (allowRemote && parsed.is_remote_only) return true;
  if (["remote", "united states", "usa", "us"].some((t) => normLocation === t && allowedNormSet.has(t))) return true;

  const allowedMatch = (): boolean =>
    allowedLocations.some((a) => {
      const normAllowed = normalizeForMatch(a);
      return normAllowed.length > 0 && normLocation.includes(normAllowed);
    });

  if (parsed.is_remote_only) return allowedMatch();
  return allowedMatch();
}
