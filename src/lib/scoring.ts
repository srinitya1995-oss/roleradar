/**
 * Fit scoring stack: Role Relevance (0-40), AI Depth (0-30), Domain Fit (0-20), Penalties (0-30).
 * FINAL_FIT_SCORE = clamp(R + AI + Domain - Penalty, 0, 100).
 * All comparisons use normalized text (→ to " to ", hyphens to space, strip +$(), lowercase).
 */

import { normalizeForMatch } from "./normalize";

/** Role Relevance: PM ownership, roadmap, metrics, cross-functional, platform/API, launch (max 40). */
const ROLE_GROUPS: { keywords: string[]; points: number }[] = [
  { keywords: ["product ownership", "own the product", "product owner", "ownership of product"], points: 8 },
  { keywords: ["roadmap", "roadmaps", "roadmap ownership", "strategic roadmap"], points: 6 },
  { keywords: ["kpi", "metrics", "okr", "key result", "measure success", "metrics ownership", "experimentation"], points: 6 },
  { keywords: ["cross-functional", "cross functional", "stakeholder", "partner with engineering", "leadership"], points: 6 },
  { keywords: ["0 to 1", "zero to one", "0-to-1", "launch", "from scratch", "greenfield"], points: 5 },
  { keywords: ["platform", "api", "primitives", "sdk", "developer experience", "surface", "end-to-end"], points: 5 },
  { keywords: ["vision", "strategy", "north star", "multi-year"], points: 4 },
];

/** AI Depth: LLMs, model behavior, evals, safety, reasoning, agentic, multimodal (max 30). */
const AI_TERMS: { keywords: string[]; points: number }[] = [
  { keywords: ["generative ai", "genai", "gen ai", "llm", "language model", "large language"], points: 6 },
  { keywords: ["model behavior", "frontier model", "fine-tune", "fine tune", "post-training"], points: 4 },
  { keywords: ["evaluation", "eval", "evaluation methodology", "red team", "red teaming"], points: 4 },
  { keywords: ["reasoning", "alignment", "safety", "reliability"], points: 3 },
  { keywords: ["conversational ai", "assistant", "copilot", "personalization", "multimodal"], points: 4 },
  { keywords: ["agentic", "agents", "retrieval", "rag", "retrieval-augmented"], points: 4 },
  { keywords: ["ml experimentation", "machine learning", "ml product"], points: 3 },
];

/** Domain Fit: matches strongest themes — conversational AI, evals, multimodal, platform, personalization (max 20). */
const DOMAIN_TERMS: { keywords: string[]; points: number }[] = [
  { keywords: ["conversational", "conversational ai", "dialogue"], points: 5 },
  { keywords: ["evaluation", "eval", "reasoning framework"], points: 4 },
  { keywords: ["multimodal", "multimodal experiences"], points: 3 },
  { keywords: ["platform", "api", "developer-facing", "primitives"], points: 3 },
  { keywords: ["personalization", "recommendation", "discovery"], points: 3 },
  { keywords: ["experimentation", "a/b", "at scale"], points: 2 },
];

/** Penalties: wrong function (PMM), wrong seniority, vague ops, gaming-specific (max 30). */
const PENALTY_TERMS: { keywords: string[]; points: number }[] = [
  { keywords: ["product marketing", "pmm", "go-to-market", "gtm"], points: 15 },
  { keywords: ["entry level", "junior", "associate product manager"], points: 10 },
  { keywords: ["hands-on unity", "game dev", "gaming required", "unity engine"], points: 10 },
  { keywords: ["pure operations", "non-product ops"], points: 5 },
];

function scoreGroups(normalizedText: string, groups: { keywords: string[]; points: number }[], cap: number): number {
  let total = 0;
  for (const g of groups) {
    const found = g.keywords.some((kw) => normalizedText.includes(normalizeForMatch(kw)));
    if (found) total += g.points;
  }
  return Math.min(cap, total);
}

/**
 * Compute Role Relevance Score 0-40 from job description.
 */
export function roleRelevanceScore(description: string | null | undefined): number {
  const norm = normalizeForMatch(description ?? "");
  return norm ? scoreGroups(norm, ROLE_GROUPS, 40) : 0;
}

/**
 * Compute AI Depth Score 0-30 from job description.
 */
export function aiDepthScore(description: string | null | undefined): number {
  const norm = normalizeForMatch(description ?? "");
  return norm ? scoreGroups(norm, AI_TERMS, 30) : 0;
}

/**
 * Compute Domain Fit Score 0-20 from job description.
 */
export function domainFitScore(description: string | null | undefined): number {
  const norm = normalizeForMatch(description ?? "");
  return norm ? scoreGroups(norm, DOMAIN_TERMS, 20) : 0;
}

/**
 * Compute Penalty 0-30 from title + description (wrong function, seniority, etc.).
 */
export function penaltyScore(title: string | null | undefined, description: string | null | undefined): number {
  const norm = normalizeForMatch([title ?? "", description ?? ""].join(" "));
  return norm ? scoreGroups(norm, PENALTY_TERMS, 30) : 0;
}

/**
 * FINAL_FIT_SCORE = clamp(Role Relevance + AI Depth + Domain Fit - Penalty, 0, 100).
 */
export function computeFinalFitScore(
  title: string | null | undefined,
  description: string | null | undefined
): number {
  const role = roleRelevanceScore(description);
  const ai = aiDepthScore(description);
  const domain = domainFitScore(description);
  const penalty = penaltyScore(title, description);
  const raw = role + ai + domain - penalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
