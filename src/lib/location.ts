/**
 * Location normalization and policy. CA + Seattle only; no remote-only unless allow_remote.
 * Hybrid tied to allowed city is OK.
 */

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
 * Job is location-eligible if: (allowed city/state match) OR (remote-only and (allow_remote OR "Remote" in allowed list)).
 * Hybrid with an allowed city is OK (substring match on raw).
 */
export function locationEligible(
  location: string | null | undefined,
  allowedLocations: string[],
  allowRemote: boolean
): boolean {
  const parsed = parseLocation(location);
  // Boards often omit location in the feed; allow so we don't drop those listings
  if (!parsed.raw_location) return true;
  if (parsed.is_remote_only) {
    const allowedByList = allowedLocations.some((a) => a.trim().toLowerCase() && parsed.raw_location.toLowerCase().includes(a.trim().toLowerCase()));
    return allowRemote || allowedByList;
  }
  const lower = parsed.raw_location.toLowerCase();
  return allowedLocations.some((a) => a.trim().toLowerCase() && lower.includes(a.trim().toLowerCase()));
}
