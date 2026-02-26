/**
 * Pre-CPI gating. Run in order; only compute CPI and store if all gates pass.
 * GATE 0: Hard title exclusion → GATE 1: Must be PM → GATE 2: Seniority → GATE 3: Location → GATE 4: Description sanity.
 */

/** GATE 0 — If title contains ANY of these (case-insensitive), discard immediately. Do NOT compute CPI, do NOT store. */
export const GATE0_HARD_TITLE_EXCLUSION = [
  "engineer",
  "developer",
  "scientist",
  "research",
  "sales",
  "account",
  "marketing",
  "product marketing",
  "finance",
  "revenue",
  "tax",
  "accounting",
  "operations",
  "procurement",
  "sourcing",
  "solutions engineer",
  "deployment",
  "success engineer",
  "forward deployed",
  "program manager",
  "tpm",
  "technical program",
  "project manager",
  "assistant",
  "business partner",
  "compliance",
  "legal",
  "hr",
];

/** GATE 1 — Title must contain one of these (PM role). */
export const GATE1_PM_TITLE = [
  "product manager",
  "product management",
  "technical product manager",
  "pm-t",
  "pmt",
];

/** GATE 2 — Title must contain one of these (seniority). */
export const GATE2_SENIORITY = ["senior", "principal", "staff"];

/** GATE 4 — If description has > this many eng-keyword hits AND no strategy/roadmap, discard. */
const GATE4_ENG_KEYWORDS = [
  "code",
  "coding",
  "python",
  "java",
  "c++",
  "implementation",
  "debugging",
];
const GATE4_ENG_THRESHOLD = 5;
const GATE4_STRATEGY_TERMS = ["product strategy", "roadmap"];

function titleContainsAny(title: string | null | undefined, terms: string[]): boolean {
  const t = (title ?? "").toLowerCase();
  return terms.some((kw) => t.includes(kw.toLowerCase()));
}

function countOccurrences(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of terms) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const m = lower.match(re);
    if (m) count += m.length;
  }
  return count;
}

function descriptionContainsAny(description: string | null | undefined, terms: string[]): boolean {
  const d = (description ?? "").toLowerCase();
  return terms.some((t) => d.includes(t.toLowerCase()));
}

/** GATE 0 — Hard title exclusion. Returns false if title contains any exclusion term (discard). */
export function passesGate0(title: string | null | undefined): boolean {
  if (!(title ?? "").trim()) return false;
  return !titleContainsAny(title, GATE0_HARD_TITLE_EXCLUSION);
}

/** GATE 1 — Must be Product Manager. Returns false if title does not contain a PM term. */
export function passesGate1(title: string | null | undefined): boolean {
  return titleContainsAny(title, GATE1_PM_TITLE);
}

/** GATE 2 — Seniority. Returns false if title does not contain senior/principal/staff. */
export function passesGate2(title: string | null | undefined): boolean {
  return titleContainsAny(title, GATE2_SENIORITY);
}

/** GATE 3 — Location. Caller uses locationMatchesAllowed(location, allowed_locations). */

/** GATE 4 — Description sanity. Discard if description looks like hands-on eng role (many eng keywords, no strategy/roadmap). */
export function passesGate4(description: string | null | undefined): boolean {
  const text = (description ?? "").trim();
  if (!text) return true; // no description → allow (CPI may be null)
  const engCount = countOccurrences(text, GATE4_ENG_KEYWORDS);
  const hasStrategy = descriptionContainsAny(description, GATE4_STRATEGY_TERMS);
  if (engCount > GATE4_ENG_THRESHOLD && !hasStrategy) return false;
  return true;
}

/**
 * Run all gates in order. Only if true should we compute CPI and store the job.
 * GATE 3 must be applied by caller with locationMatchesAllowed(location, settings.allowed_locations).
 * Seniority (GATE 2) is optional: we include all Product Manager roles, not only Senior/Principal/Staff.
 */
export function passesTitleAndDescriptionGates(
  title: string | null | undefined,
  description: string | null | undefined
): boolean {
  if (!passesGate0(title)) return false;
  if (!passesGate1(title)) return false;
  if (!passesGate4(description)) return false;
  return true;
}
