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
  const is_remote_only =
    REMOTE_ONLY_PATTERNS.some((p) => p.test(raw)) ||
    (is_remote && !is_hybrid && !/\b(san francisco|sf|seattle|la|los angeles|bellevue|redmond|california|ca)\b/i.test(raw));

  return { raw_location: raw, is_remote, is_hybrid, is_remote_only };
}

/**
 * Job is location-eligible if: (allowed city/state/country match) OR (remote-only and (allow_remote OR "Remote" in allowed list)).
 * Uses normalize() so job location "San Francisco, CA" passes when allowed has "CA" or "San Francisco".
 * If the normalized job location contains any normalized allowed_locations substring, PASS.
 */
export function locationEligible(
  location: string | null | undefined,
  allowedLocations: string[],
  allowRemote: boolean
): boolean {
  const parsed = parseLocation(location);
  if (!parsed.raw_location) return true;

  const normLocation = normalizeForMatch(location);
  const allowedMatch = (): boolean =>
    allowedLocations.some((a) => {
      const normAllowed = normalizeForMatch(a);
      return normAllowed.length > 0 && normLocation.includes(normAllowed);
    });

  if (parsed.is_remote_only) return allowRemote || allowedMatch();
  return allowedMatch();
}
