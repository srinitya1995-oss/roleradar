/**
 * Test fixture: expected bucket + scores for sample job descriptions.
 * Run: npx tsx tests/scoring-fixture.ts
 *
 * Samples:
 * 1) OpenAI-style "API Model Behavior PM" → high AI depth, high domain fit → APPLY_NOW or STRONG_FIT
 * 2) Unity-style "agentic AI workflows PM" (gaming-specific) → penalty → lower bucket or HIDE
 */

import { computeFinalFitScore } from "../src/lib/scoring";
import { profileMatchScore } from "../src/lib/profile";
import { computeBucket } from "../src/lib/buckets";

const FIXTURES: { name: string; title: string; description: string }[] = [
  {
    name: "OpenAI API Model Behavior PM",
    title: "Senior Product Manager, API Model Behavior",
    description: `
      We're looking for a Senior PM to own model behavior and API primitives for our platform.
      You will own the roadmap for developer-facing APIs, evaluation frameworks, and safety.
      Cross-functional ownership with engineering; 0 to 1 and launch experience.
      Generative AI, LLM behavior, fine-tuning, and alignment are core to this role.
      Conversational AI and multimodal experiences at scale. Experimentation and metrics ownership.
    `,
  },
  {
    name: "Unity Agentic AI PM (gaming-heavy)",
    title: "Senior Product Manager, Agentic AI Workflows",
    description: `
      Lead product for agentic AI workflows in our gaming engine.
      Hands-on Unity game dev required; you will work with game designers on in-engine tools.
      LLM integration, evaluation, and reasoning. Product ownership and roadmap.
      Note: Must have shipped at least one Unity title. Gaming-specific requirement.
    `,
  },
  {
    name: "Generic PM (no AI depth)",
    title: "Senior Product Manager",
    description: `
      Own the product roadmap and KPIs. Cross-functional leadership.
      Partner with engineering. 0 to 1 and launch experience.
      No AI or ML keywords.
    `,
  },
];

function run() {
  console.log("Scoring fixture – expected bucket + scores\n");
  for (const f of FIXTURES) {
    const fit = computeFinalFitScore(f.title, f.description);
    const resume = profileMatchScore(f.title, f.description);
    const bucket = computeBucket(resume, fit);
    console.log(`${f.name}`);
    console.log(`  Title: ${f.title}`);
    console.log(`  final_fit_score: ${fit}, resume_match: ${resume}, bucket: ${bucket}`);
    console.log("");
  }
}

run();
