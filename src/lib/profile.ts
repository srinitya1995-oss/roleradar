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
 * Category-based surface matching: JD doesn't say "Amazon Rufus", but if it has
 * Shopping + AI or E-commerce + Conversational, we count it as that surface.
 * Each category lists alternative token-pairs; if any pair is present (both tokens
 * in normalized text), the surface gets credit.
 */
const SURFACE_CATEGORIES: { surface: string; tokenPairs: string[][] }[] = [
  {
    surface: "Alexa Generative AI",
    tokenPairs: [
      ["conversational", "ai"],
      ["conversational", "generative"],
      ["assistant", "llm"],
      ["voice", "ai"],
      ["alexa", "ai"],
    ],
  },
  {
    surface: "conversational shopping",
    tokenPairs: [
      ["conversational", "shopping"],
      ["shopping", "ai"],
      ["e-commerce", "conversational"],
      ["ecommerce", "conversational"],
      ["conversational", "commerce"],
    ],
  },
  {
    surface: "reasoning infrastructure",
    tokenPairs: [
      ["reasoning", "infrastructure"],
      ["reasoning", "scale"],
      ["reasoning", "systems"],
      ["inference", "reasoning"],
    ],
  },
  {
    surface: "multimodal experiences",
    tokenPairs: [
      ["multimodal", "experience"],
      ["multimodal", "experiences"],
      ["multimodal", "product"],
      ["vision", "language"],
    ],
  },
  {
    surface: "evaluation frameworks",
    tokenPairs: [
      ["reasoning", "accuracy"],
      ["evaluation", "benchmarks"],
      ["evaluation", "metrics"],
      ["eval", "benchmark"],
      ["red team", "model"],
      ["model", "evaluation"],
    ],
  },
  {
    surface: "LLM-powered surfaces",
    tokenPairs: [
      ["llm", "surface"],
      ["llm", "surfaces"],
      ["generative", "product"],
      ["language model", "product"],
      ["llm", "product"],
    ],
  },
  {
    surface: "Amazon Rufus",
    tokenPairs: [
      ["shopping", "ai"],
      ["e-commerce", "conversational"],
      ["ecommerce", "conversational"],
      ["search", "generative"],
      ["commerce", "llm"],
    ],
  },
];

function normalizedTextContainsTokenPair(norm: string, pair: string[]): boolean {
  const [a, b] = pair.map((p) => normalizeForMatch(p));
  return norm.includes(a) && norm.includes(b);
}

function countCategorySurfaceHits(normalizedText: string): number {
  let hits = 0;
  for (const { tokenPairs } of SURFACE_CATEGORIES) {
    const matched = tokenPairs.some((pair) => normalizedTextContainsTokenPair(normalizedText, pair));
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

  // Surface score (40 max): category-based. Count how many surface categories the JD matches.
  const maxSurfaceScore = 40;
  const surfaceCategoryHits = countCategorySurfaceHits(norm);
  const surfaceScore = Math.min(
    maxSurfaceScore,
    (surfaceCategoryHits / Math.max(SURFACE_CATEGORIES.length, 1)) * maxSurfaceScore
  );

  const score = keywordScore + surfaceScore;
  return Math.round(Math.min(100, Math.max(0, score)));
}
