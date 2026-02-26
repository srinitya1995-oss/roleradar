/**
 * CPI (Candidate–Role Fit Index) multi-layer scoring 0–10 for Principal GenAI product roles.
 * Layer 1: PM-aware exclusion (only exclude non-PM titles; PM token overrides exclusion words).
 * Layer 2: Role Fit Score 0–5 (product/roadmap/KPI/cross-functional/strategy/platform/ambiguity).
 * Layer 3: AI Depth Score 0–5 (genai/llm/model behavior/alignment/safety/etc.).
 * Final CPI = Role Fit + AI Depth, clamped 0–10. cpi=null only when title is not PM-eligible.
 */

/** PM title tokens (case-insensitive). If title contains any of these, do not exclude for engineer/research/etc. */
const PM_TITLE_TOKENS = [
  "product manager",
  "product management",
  "technical product manager",
  "pm-t",
  "pmt",
];

/** Exclude only when title does NOT contain a PM token. */
const EXCLUSION_IF_NOT_PM = [
  "engineer",
  "scientist",
  "research",
  "finance",
  "sales",
  "marketing",
  "hr",
  "legal",
  "operations",
  "director",
  "head",
  "vp",
];

/** Explicit non-PM roles (e.g. product marketing). */
const EXPLICIT_NON_PM = ["product marketing"];

/** Layer 2: Role Fit keyword groups (1 point per group present, max 5). */
const ROLE_FIT_GROUPS: string[][] = [
  ["product ownership", "product owner", "own the product", "ownership of product", "product ownership language"],
  ["roadmap", "roadmaps", "roadmap ownership"],
  ["kpi", "metrics", "okr", "key result", "measure success", "metrics ownership"],
  ["cross-functional", "cross functional", "stakeholder", "leadership", "partner with engineering", "cross-functional leadership"],
  ["0 to 1", "zero to one", "0-to-1", "launch", "launched", "from scratch", "greenfield", "launch language"],
  ["vision", "strategy", "strategic priorities", "north star", "multi-year"],
  ["ambiguity", "0 to 1", "greenfield"],
  ["platform", "api", "primitives", "sdk", "developer experience", "surface", "end-to-end", "end to end"],
];

/** Layer 3: AI Depth terms (count distinct presence, cap at 5). */
const AI_DEPTH_TERMS = [
  "generative ai",
  "genai",
  "gen ai",
  "llm",
  "language model",
  "large language",
  "conversational ai",
  "assistant",
  "copilot",
  "reasoning",
  "evaluation",
  "safety",
  "personalization",
  "multimodal",
  "model behavior",
  "frontier model",
  "fine-tune",
  "fine tune",
  "post-training",
  "post training",
  "alignment",
  "red teaming",
  "red team",
  "eval",
  "evaluation methodology",
  "reliability",
];

function hasPMToken(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return PM_TITLE_TOKENS.some((token) => t.includes(token));
}

function isExplicitNonPM(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return EXPLICIT_NON_PM.some((phrase) => t.includes(phrase));
}

/**
 * PM-eligible: title contains a PM token and is not an explicit non-PM role (e.g. product marketing).
 * Exclusion words (engineer, scientist, etc.) only apply when title does NOT contain a PM token;
 * if title has a PM token, we do not exclude.
 */
export function isPmEligible(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;
  if (!hasPMToken(t)) return false;
  if (isExplicitNonPM(t)) return false;
  return true;
}

function countGroupHits(text: string, groups: string[][]): { count: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let count = 0;
  for (const group of groups) {
    const found = group.find((kw) => lower.includes(kw));
    if (found) {
      count++;
      matched.push(found);
    }
  }
  return { count, matched };
}

function countTermHits(text: string, terms: string[]): { count: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let count = 0;
  for (const term of terms) {
    if (lower.includes(term)) {
      count++;
      matched.push(term);
    }
  }
  return { count, matched };
}

/**
 * Role Fit Score 0–5 from description.
 */
export function roleFitScore(description: string | null | undefined): number {
  const text = (description ?? "").trim();
  if (!text) return 0;
  const { count } = countGroupHits(text, ROLE_FIT_GROUPS);
  return Math.min(5, count);
}

/**
 * AI Depth Score 0–5 from description.
 */
export function aiDepthScore(description: string | null | undefined): number {
  const text = (description ?? "").trim();
  if (!text) return 0;
  const { count } = countTermHits(text, AI_DEPTH_TERMS);
  return Math.min(5, count);
}

export interface CpiBreakdown {
  cpi: number | null;
  role_fit: number;
  ai_depth: number;
  matched_phrases: string[];
}

/**
 * Compute CPI with debug breakdown. Returns cpi=null only when title is not PM-eligible.
 */
export function scoreCpiBreakdown(
  title: string | null | undefined,
  description: string | null | undefined
): CpiBreakdown {
  const t = (title ?? "").trim();
  const desc = (description ?? "").trim();

  if (!hasPMToken(t) || isExplicitNonPM(t)) {
    return { cpi: null, role_fit: 0, ai_depth: 0, matched_phrases: [] };
  }

  const roleResult = countGroupHits(desc, ROLE_FIT_GROUPS);
  const aiResult = countTermHits(desc, AI_DEPTH_TERMS);
  const roleFit = Math.min(5, roleResult.count);
  const aiDepth = Math.min(5, aiResult.count);
  const raw = roleFit + aiDepth;
  const cpi = Math.min(10, Math.max(0, raw));
  const matched_phrases = [...roleResult.matched, ...aiResult.matched];

  return { cpi, role_fit: roleFit, ai_depth: aiDepth, matched_phrases };
}

/**
 * Multi-layer CPI. Returns null only when title is not PM-eligible (no PM token or explicit non-PM).
 * Otherwise CPI = clamp(Role Fit Score + AI Depth Score, 0, 10); no minimum Role Fit.
 */
export function scoreCpi(
  title: string | null | undefined,
  description: string | null | undefined
): number | null {
  const { cpi } = scoreCpiBreakdown(title, description);
  return cpi;
}

/**
 * Tier label from CPI score (9–10 Top 5%, 7–8 Top 20%, <7 Reject). Applied after multi-layer scoring.
 */
export function cpiTier(score: number): string {
  if (score >= 9) return "Top 5%";
  if (score >= 7) return "Top 20%";
  return "Reject";
}
