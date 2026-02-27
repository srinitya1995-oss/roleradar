/**
 * Candidate profile for RoleRadar personalization (prompts, recommendation ranking).
 * Semantic matching: normalization, synonyms, and category-based surface scoring.
 */

import {
  normalizeForMatch,
  normalizedContainsOrTokensWithin,
  getEquivalents,
} from "./normalize";

export type CandidateProfile = {
  name: string;
  title: string;
  company: string;
  location: string;
  /** One-line summary for prompts. */
  summary: string;
  /** Key surfaces/areas for "surface similarity" matching. */
  surfaces: string[];
  /** Keywords for shared-background ranking (ex-Amazon, GenAI, etc.). */
  backgroundKeywords: string[];
};

/** Candidate profile — Principal PM-T, Alexa GenAI. Update when resume changes. */
export const candidateProfile: CandidateProfile = {
  name: "Srinitya Duppanapudi Satya",
  title: "Senior Product Manager, Technical",
  company: "Amazon",
  location: "Seattle, USA",
  summary:
    "Technical PM with 9+ years leading 0→1 AI products at scale. Alexa Generative AI (conversational reasoning, multimodal experiences); owned conversational shopping 0→1, GenAI core roadmap, evaluation/reasoning frameworks, Rufus latency optimization. Ex–Bank of America ERICA AI (via TCS). 39M+ users.",
  surfaces: [
    "Alexa Generative AI",
    "conversational shopping",
    "reasoning infrastructure",
    "multimodal experiences",
    "evaluation frameworks",
    "LLM-powered surfaces",
    "Amazon Rufus",
  ],
  backgroundKeywords: [
    "ex-Amazon",
    "ex Amazon",
    "PM-T",
    "Principal PM",
    "Senior PM",
    "GenAI",
    "generative AI",
    "conversational AI",
    "LLM",
    "reasoning",
    "evaluation",
    "multimodal",
    "0-to-1",
    "product roadmap",
    "cross-functional",
  ],
};

/**
 * Surface alias mapping: JDs won't say "Amazon Rufus" or "Alexa Reasoning".
 * If the normalized JD contains any alias from a category, grant that surface points.
 */
const SURFACE_ALIASES: Record<string, string[]> = {
  "Amazon Rufus": ["shopping", "e-commerce", "ecommerce", "consumer ai", "retail", "commerce"],
  "Alexa Generative AI": ["agentic", "assistant", "llm reasoning", "multi-step", "multistep", "conversational ai", "voice ai", "alexa"],
  "conversational shopping": ["conversational", "shopping", "e-commerce", "ecommerce", "commerce"],
  "reasoning infrastructure": ["reasoning", "infrastructure", "inference", "multi-step", "multistep"],
  "multimodal experiences": ["multimodal", "vision", "language", "experience", "experiences"],
  "evaluation frameworks": ["benchmarks", "red teaming", "red team", "accuracy metrics", "evals", "evaluation", "eval"],
  "LLM-powered surfaces": ["llm", "generative", "language model", "surface", "surfaces", "product"],
};

function countSurfaceAliasHits(normalizedText: string): number {
  let hits = 0;
  for (const aliases of Object.values(SURFACE_ALIASES)) {
    const matched = aliases.some((alias) => {
      const n = normalizeForMatch(alias);
      return n && normalizedText.includes(n);
    });
    if (matched) hits += 1;
  }
  return hits;
}

/** Short context string to inject into Referral Target Finder prompt (shared background). */
export function getCandidateContextForPrompt(profile: CandidateProfile = candidateProfile): string {
  const parts = [
    `Candidate: ${profile.name}.`,
    `${profile.title} at ${profile.company} (${profile.location}).`,
    profile.summary,
    `Key surfaces: ${profile.surfaces.join(", ")}.`,
    `Prioritize shared background: ${profile.backgroundKeywords.slice(0, 8).join(", ")}.`,
  ];
  return parts.join(" ");
}

/**
 * Resume-based match: 0–100. Uses normalization, synonyms, fuzzy tokens, and category-based
 * surface matching so that 0→1, 0-to-1, GenAI/LLM, and "Shopping + AI" (for Rufus) all count.
 */
export function profileMatchScore(
  jobTitle: string | null | undefined,
  jobDescription: string | null | undefined,
  profile: CandidateProfile = candidateProfile
): number {
  const raw = [jobTitle ?? "", jobDescription ?? ""].join(" ");
  if (!raw.trim()) return 0;

  const norm = normalizeForMatch(raw);

  // Keyword score (60 max): each background keyword matches if normalized text contains
  // the keyword or any of its synonyms (e.g. 0-to-1 and 0→1).
  const maxKeywordScore = 60;
  let keywordHits = 0;
  for (const kw of profile.backgroundKeywords) {
    const equivalents = getEquivalents(kw);
    if (equivalents.some((e) => norm.includes(e))) keywordHits += 1;
    else if (normalizedContainsOrTokensWithin(raw, kw)) keywordHits += 1;
  }
  const keywordScore = Math.min(
    maxKeywordScore,
    (keywordHits / Math.max(profile.backgroundKeywords.length, 1)) * maxKeywordScore
  );

  // Surface score (40 max): alias-based. If JD contains any alias from a surface category, grant points.
  const maxSurfaceScore = 40;
  const surfaceAliasHits = countSurfaceAliasHits(norm);
  const numSurfaces = Object.keys(SURFACE_ALIASES).length;
  const surfaceScore = Math.min(
    maxSurfaceScore,
    (surfaceAliasHits / Math.max(numSurfaces, 1)) * maxSurfaceScore
  );

  const score = keywordScore + surfaceScore;
  return Math.round(Math.min(100, Math.max(0, score)));
}
