/**
 * Type 4 Custom Boards — discovery seed data and agent instructions.
 * Solid "Big Tech" seed data: URLs and targeted keyword queries for 95%+ profile match.
 * See docs/TYPE_4_DISCOVERY_CONFIG.md.
 */

export type Type4Source = {
  company: string;
  targetOrgProduct: string;
  seedQuery: string;
  whyFits: string;
  /** Careers search URL for headless discovery. */
  discoveryUrl?: string;
};

/** Solid "Big Tech" seed data — Custom Enterprise targets that match your profile. Use in seeding script so the agent pulls relevant data. */
export const TYPE_4_SOURCES: Type4Source[] = [
  {
    company: "Apple",
    targetOrgProduct: "Apple Intelligence & Siri",
    seedQuery: "Senior Product Manager Apple Intelligence Siri",
    whyFits: "Matches your 89% → 99% accuracy work on conversational reasoning and Siri's new agentic capabilities.",
    discoveryUrl: "https://jobs.apple.com/en-us/search",
  },
  {
    company: "Google",
    targetOrgProduct: "Gemini / Shopping",
    seedQuery: "Senior Product Manager Gemini Retail CX",
    whyFits: "Direct 1:1 match for your Amazon Rufus (conversational shopping) experience.",
    discoveryUrl: "https://careers.google.com/jobs/results/",
  },
  {
    company: "Microsoft",
    targetOrgProduct: "Copilot Consumer (MAI)",
    seedQuery: "Principal Product Manager Copilot Consumer Search",
    whyFits: "Matches your work on multimodal discovery and 0→1 consumer search experiences.",
    discoveryUrl: "https://careers.microsoft.com/professionals/us/en/search",
  },
  {
    company: "Netflix",
    targetOrgProduct: "Personalization & Discovery",
    seedQuery: "AI Product Manager Personalization Discovery",
    whyFits: "Matches your 92% recommendation relevancy success and content discovery strategy.",
    discoveryUrl: "https://jobs.netflix.com/search",
  },
  {
    company: "TikTok",
    targetOrgProduct: "TikTok Shop AI",
    seedQuery: "Product Manager TikTok Shop User Product",
    whyFits: "Matches your consumer-facing discovery and shopping agent work.",
    discoveryUrl: "https://careers.tiktok.com/",
  },
  {
    company: "Meta",
    targetOrgProduct: "Llama / GenAI Product",
    seedQuery: "Technical Product Manager Multimodal AI",
    whyFits: "Matches your work on Alexa multimodal interfaces.",
    discoveryUrl: "https://www.metacareers.com/jobs",
  },
  {
    company: "Intuit",
    targetOrgProduct: "AI Foundations / GenOS",
    seedQuery: "Staff PM AI Agents Context",
    whyFits: "Matches your reasoning infrastructure at Amazon.",
    discoveryUrl: "https://www.intuit.com/careers/",
  },
];

/** High-value consumer-facing roles (Feb 2026) with referral paths. */
export const HIGH_VALUE_CONSUMER_ROLES = [
  {
    company: "Google",
    role: "PM, Gemini CX (Customer Experience) — Google Shopping Agent",
    referralPath: "Search for ex-Amazon Alexa PMs now at Google.",
  },
  {
    company: "Apple",
    role: "Senior PM, Siri Consumer Intelligence (Agentic AI in apps)",
    referralPath: "Use the 250+ JHU alumni at Apple.",
  },
  {
    company: "Netflix",
    role: "AI Product Manager, Streaming Discovery",
    referralPath: "Target PMs in Member Experience or Search Engineering.",
  },
];

/**
 * Immediate "APPLY NOW" targets (Feb 2026). If the agent is working correctly, these should be at the top.
 */
export const APPLY_NOW_TARGETS_FEB_2026 = [
  {
    company: "Apple",
    role: "Senior Product Manager, Apple Intelligence and Siri",
    focus: "Launching AI experiences across operating systems. Matches your Alexa 3-Year Vision work.",
  },
  {
    company: "Netflix",
    role: "AI Product Manager, Content Platform Operations",
    focus: "Transforming internal tools and consumer content operations. Matches your multimodal interface expertise.",
  },
  {
    company: "Microsoft",
    role: "Principal Product Manager, Copilot Studio",
    focus: "Monetization and usage of agentic experiences. Matches your $79M revenue contribution and transaction growth experience.",
  },
];

/** Agent instructions for Custom (Type 4) boards. */
export const TYPE_4_AGENT_INSTRUCTIONS = `
For Apple, Google, and Meta, use the Headless Discovery protocol:
1. Navigate to the provided Discovery URL.
2. Intercept the JSON response in the network traffic to bypass SPA (Single Page App) rendering.
3. Do not rely on DOM scraping — use the underlying API once discovered.

Alias Matching:
- If a job is at Apple and mentions "Siri", map it to my Alexa AI surface.
- If it's at Google and mentions "Shopping" (or Gemini CX / Shopping Agent), map it to my Amazon Rufus surface.
- Meta + "Llama" / "Multimodal" → map to my Alexa multimodal surface.
`.trim();
