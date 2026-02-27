/**
 * Pre-scoring gating. Only ingest Senior/Principal PM, PM-T, TPM roles. No PMM, no program/project manager.
 * GATE 0: Hard title exclusion → GATE 1: Must be PM → GATE 2: Seniority → GATE 3: Location → GATE 4: Description sanity.
 * Gate 4: PM-T/Technical Product Manager titles bypass the eng-keyword penalty; strategy/roadmap use normalized text.
 */
import { normalizeForMatch } from "@/src/lib/normalize";

/** GATE 0 — If title contains ANY of these (case-insensitive), discard. Do NOT store. Excludes non-PM roles; "tpm" removed so Technical Product Manager is allowed. */
export const GATE0_HARD_TITLE_EXCLUSION = [
  "intern",
  "contract",
  "designer",
  "engineer",
  "developer",
  "scientist",
  "research",
  "sales",
  "account",
  "marketing",
  "product marketing",
  "pmm",
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
  "technical program manager",
  "project manager",
  "assistant",
  "business partner",
  "compliance",
  "legal",
  "hr",
];

/** GATE 1 — Title must contain one of these (PM role). GPM added only when allow_gpm true (see passesTitleAndDescriptionGates). */
export const GATE1_PM_TITLE = [
  "product manager",
  "product management",
  "technical product manager",
  "pm-t",
  "pmt",
  "product lead",
  "principal product",
  "ai product",
  "ml product",
  "genai",
  "gen ai",
  "agentic",
  "personalization",
  "discovery",
  "consumer",
];

/** GATE 2 — Title must contain one of these (seniority): Senior, Sr, Principal, Staff. */
export const GATE2_SENIORITY = ["senior", "sr.", "sr ", "principal", "staff"];

/** GATE 4 — If description has > this many eng-keyword hits AND no strategy/roadmap, discard. PM-T/TPM titles bypass. */
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
/** Strategy/roadmap checked via normalized text so "Product Strategy" and "Roadmap" aren't missed. */
const GATE4_STRATEGY_TERMS_NORMALIZED = ["product strategy", "roadmap"];

function titleContainsAny(title: string | null | undefined, terms: string[]): boolean {
  const norm = normalizeForMatch(title ?? "");
  return terms.some((kw) => norm.includes(normalizeForMatch(kw)));
}

/** True if title suggests technical/senior PM (bypass Gate 4 eng-keyword penalty). */
function isTechnicalPmTitle(title: string | null | undefined): boolean {
  const norm = normalizeForMatch(title ?? "");
  return (
    norm.includes("technical") ||
    norm.includes("pm-t") ||
    norm.includes("pmt") ||
    norm.includes("senior")
  );
}

function countOccurrences(text: string, terms: string[]): number {
  const norm = normalizeForMatch(text);
  let count = 0;
  for (const kw of terms) {
    const n = normalizeForMatch(kw);
    if (!n) continue;
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const m = norm.match(re);
    if (m) count += m.length;
  }
  return count;
}

function descriptionContainsStrategyNormalized(description: string | null | undefined): boolean {
  const norm = normalizeForMatch(description ?? "");
  return GATE4_STRATEGY_TERMS_NORMALIZED.some((t) => norm.includes(normalizeForMatch(t)));
}

/** GATE 0 — Hard title exclusion. Returns false if title contains any exclusion term (discard). */
export function passesGate0(title: string | null | undefined): boolean {
  if (!(title ?? "").trim()) return false;
  return !titleContainsAny(title, GATE0_HARD_TITLE_EXCLUSION);
}

/** GATE 1 — Must be Product Manager. If allowGpm true, also allow "group product manager". */
export function passesGate1(title: string | null | undefined, allowGpm = false): boolean {
  const list = allowGpm ? [...GATE1_PM_TITLE, "group product manager"] : GATE1_PM_TITLE;
  return titleContainsAny(title, list);
}

/** GATE 2 — Seniority. Returns false if title does not contain senior/sr/principal. */
export function passesGate2(title: string | null | undefined): boolean {
  return titleContainsAny(title, GATE2_SENIORITY);
}

/** GATE 3 — Location. Caller uses locationMatchesAllowed(location, allowed_locations). */

/** GATE 4 — Description sanity. Discard if description looks like hands-on eng role (many eng keywords, no strategy/roadmap). Technical PM titles bypass eng penalty. */
export function passesGate4(
  title: string | null | undefined,
  description: string | null | undefined
): boolean {
  const text = (description ?? "").trim();
  if (!text) return true; // no description → allow (CPI may be null)
  if (isTechnicalPmTitle(title)) return true; // PM-T / Technical Product Manager: ignore eng-keyword count
  const engCount = countOccurrences(text, GATE4_ENG_KEYWORDS);
  const hasStrategy = descriptionContainsStrategyNormalized(description);
  if (engCount > GATE4_ENG_THRESHOLD && !hasStrategy) return false;
  return true;
}

/**
 * Run all gates in order. Only if true should we compute score and store the job.
 * GATE 2 (seniority) enforced unless allowJuniorPm. GATE 3 applied by caller via locationEligible().
 * Pass allowGpm from settings.allow_gpm, allowJuniorPm from settings.allow_junior_pm.
 */
export function passesTitleAndDescriptionGates(
  title: string | null | undefined,
  description: string | null | undefined,
  allowGpm = false,
  allowJuniorPm = false
): boolean {
  if (!passesGate0(title)) return false;
  if (!passesGate1(title, allowGpm)) return false;
  if (!allowJuniorPm && !passesGate2(title)) return false;
  if (!passesGate4(title, description)) return false;
  return true;
}
