/**
 * Company priority tiers for Job Source Fetching V2.
 * Tier 1 = 30 min, Tier 2 = 2 hr, Tier 3 = daily.
 */

export const TIER_1_COMPANIES = new Set(
  [
    "Microsoft",
    "Google",
    "LinkedIn",
    "Uber",
    "Airbnb",
    "OpenAI",
    "Anthropic",
    "Intuit",
    "Pinterest",
    "Apple",
    "Meta",
    "Netflix",
    "Amazon",
  ].map((s) => s.trim().toLowerCase())
);

export const TIER_2_COMPANIES = new Set(
  [
    "DoorDash",
    "Instacart",
    "Expedia",
    "Snap",
    "YouTube",
    "Adobe",
    "Figma",
    "Notion",
    "Stripe",
    "Shopify",
    "Block",
    "CashApp",
  ].map((s) => s.trim().toLowerCase())
);

/** Tier 3 = all others (optional exploration). Returns 1, 2, or 3. */
export function getCompanyTier(company: string | null | undefined): number {
  const key = (company ?? "").trim().toLowerCase();
  if (TIER_1_COMPANIES.has(key)) return 1;
  if (TIER_2_COMPANIES.has(key)) return 2;
  return 3;
}

export function getPollIntervalMinutesForTier(tier: number): number {
  if (tier === 1) return 30;
  if (tier === 2) return 120;
  return 24 * 60; // daily
}
