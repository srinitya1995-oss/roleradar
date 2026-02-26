/**
 * Tailored resume/keyword suggestions for NEAR_MATCH jobs.
 * Maps to Srinitya's real background: Alexa GenAI, eval frameworks, multimodal, API/platform, etc.
 * Output: 5–8 items with emphasize, where, example (concrete rewrite).
 */

export type SuggestionItem = { emphasize: string; where: string; example: string };

const THEMES: SuggestionItem[] = [
  {
    emphasize: "Alexa GenAI & conversational reasoning",
    where: "Resume summary / Amazon bullets",
    example: "Led 0→1 conversational AI product at Alexa; owned GenAI core roadmap and reasoning infrastructure.",
  },
  {
    emphasize: "Evaluation frameworks & rigor",
    where: "Skills / Amazon bullets",
    example: "Designed evaluation methodology for LLM behavior; drove reliability and red-team rigor (89→99% quality).",
  },
  {
    emphasize: "Multimodal experiences at scale",
    where: "Resume summary / scale metrics",
    example: "Shipped multimodal experiences at 39M+ user scale; owned cross-surface consistency and latency.",
  },
  {
    emphasize: "Temporal reasoning & agentic workflows",
    where: "Amazon / ERICA bullets",
    example: "Drove temporal reasoning and multi-turn agentic flows; partnered with ML on model behavior.",
  },
  {
    emphasize: "Experimentation & A/B at scale",
    where: "Bullets / metrics",
    example: "Owned experimentation framework and A/B strategy; measured success via OKRs and launch metrics.",
  },
  {
    emphasize: "API / platform & developer-facing primitives",
    where: "Technical PM bullets",
    example: "Defined API and developer-facing primitives; owned platform roadmap and 0→1 launch.",
  },
  {
    emphasize: "Cross-functional ownership",
    where: "Summary / leadership bullets",
    example: "Led cross-functional teams (eng, design, science); drove roadmap and stakeholder alignment.",
  },
  {
    emphasize: "Personalization & recommendation systems",
    where: "Surfaces / product scope",
    example: "Owned personalization and discovery features; improved recommendation quality and engagement.",
  },
];

const MAX_SUGGESTIONS = 8;

/**
 * Generate 5–8 tailored suggestions for a NEAR_MATCH job.
 * Picks themes that align with job title + description keywords (deterministic).
 */
export function generateSuggestionsForNearMatch(
  title: string | null | undefined,
  description: string | null | undefined
): SuggestionItem[] {
  const text = [title ?? "", description ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return THEMES.slice(0, 5);

  const scored = THEMES.map((item) => {
    let score = 0;
    const emphasizeLower = item.emphasize.toLowerCase();
    if (text.includes("eval") || text.includes("evaluation")) score += emphasizeLower.includes("eval") ? 2 : 0;
    if (text.includes("multimodal")) score += emphasizeLower.includes("multimodal") ? 2 : 0;
    if (text.includes("api") || text.includes("platform")) score += emphasizeLower.includes("api") || emphasizeLower.includes("platform") ? 2 : 0;
    if (text.includes("conversational") || text.includes("genai") || text.includes("llm")) score += emphasizeLower.includes("conversational") || emphasizeLower.includes("genai") ? 2 : 0;
    if (text.includes("personalization") || text.includes("recommendation")) score += emphasizeLower.includes("personalization") || emphasizeLower.includes("recommendation") ? 2 : 0;
    if (text.includes("experiment") || text.includes("a/b")) score += emphasizeLower.includes("experiment") ? 2 : 0;
    if (text.includes("cross-functional") || text.includes("stakeholder")) score += emphasizeLower.includes("cross-functional") ? 2 : 0;
    if (text.includes("agent") || text.includes("reasoning")) score += emphasizeLower.includes("temporal") || emphasizeLower.includes("agentic") ? 2 : 0;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, MAX_SUGGESTIONS).map((x) => x.item);
  return picked.length >= 5 ? picked : [...picked, ...THEMES.filter((t) => !picked.includes(t))].slice(0, MAX_SUGGESTIONS);
}
