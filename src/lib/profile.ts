/**
 * Candidate profile for RoleRadar personalization (prompts, recommendation ranking).
 * Derived from resume; edit as needed. Used to inject "shared background" into Referral Target Finder and ranking.
 */

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
 * Resume-based match: 0–100 score from how well job title + description align with candidate profile
 * (surfaces + background keywords). Used to blend with CPI for Match column.
 */
export function profileMatchScore(
  jobTitle: string | null | undefined,
  jobDescription: string | null | undefined,
  profile: CandidateProfile = candidateProfile
): number {
  const text = [jobTitle ?? "", jobDescription ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return 0;

  let score = 0;
  const maxKeywordScore = 60;
  const maxSurfaceScore = 40;
  const keywordHits = profile.backgroundKeywords.filter((kw) => text.includes(kw.toLowerCase())).length;
  const surfaceHits = profile.surfaces.filter((s) => text.includes(s.toLowerCase())).length;

  score += Math.min(maxKeywordScore, (keywordHits / Math.max(profile.backgroundKeywords.length, 1)) * maxKeywordScore);
  score += Math.min(maxSurfaceScore, (surfaceHits / Math.max(profile.surfaces.length, 1)) * maxSurfaceScore);

  return Math.round(Math.min(100, Math.max(0, score)));
}
