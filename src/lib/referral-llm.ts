/**
 * Referral Target Finder v2 via LLM. Returns archetype, team_keywords, role_family + 3 targets with search_query and confidence.
 * No names; search queries only. Set OPENAI_API_KEY to enable. Fallback to heuristic on error.
 */

import { getReferralTargetFinderPrompt } from "./prompts";

export type LLMReferralPayload = {
  archetype?: string;
  team_keywords?: string[];
  role_family?: string;
  targets: Array<{
    target_type: "recruiter" | "hiring_manager" | "team_pm_or_peer" | "high_signal_connector";
    search_query: string;
    why_selected: string;
    confidence?: number;
  }>;
};

const TARGET_TYPES = ["recruiter", "hiring_manager", "team_pm_or_peer", "high_signal_connector"] as const;

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query.replace(/\s+/g, " ").trim());
  return `https://www.google.com/search?q=${encoded}`;
}

/**
 * Call OpenAI v2: return archetype, team_keywords, role_family + 3 targets (search_query, why_selected, confidence 0-100).
 * Returns null if no API key or on parse/API error (caller falls back to heuristic).
 */
export async function getReferralTargetsFromLLMV2(
  job: { title: string | null; company: string; job_id: string; description: string | null; location?: string | null }
): Promise<LLMReferralPayload | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;

  const systemPrompt = getReferralTargetFinderPrompt(true);
  const descriptionSnippet = (job.description ?? "").slice(0, 6000);
  const userPrompt = `Job posting:
- Title: ${job.title ?? "N/A"}
- Company: ${job.company}
- Job ID: ${job.job_id}
- Location: ${job.location ?? "N/A"}
- Description (excerpt): ${descriptionSnippet || "N/A"}

Respond with a single JSON object only, no markdown or extra text:
{
  "archetype": "short role archetype label (e.g. Principal PM GenAI)",
  "team_keywords": ["up to 3 team/surface keywords from the job", "e.g. GenAI", "LLM"],
  "role_family": "product | senior product | principal product | technical product",
  "targets": [
    { "target_type": "recruiter", "search_query": "exact phrase for Google to find recruiter LinkedIn", "why_selected": "1-2 sentences", "confidence": 0-100 },
    { "target_type": "hiring_manager", "search_query": "exact phrase for Google (e.g. Company Head of Product GenAI LinkedIn)", "why_selected": "1-2 sentences", "confidence": 0-100 },
    { "target_type": "team_pm_or_peer", "search_query": "exact phrase for Google (e.g. Company Senior Product Manager GenAI LinkedIn)", "why_selected": "1-2 sentences", "confidence": 0-100 },
    { "target_type": "high_signal_connector", "search_query": "exact phrase for Google (e.g. Company ex Amazon Principal Product LinkedIn)", "why_selected": "1-2 sentences", "confidence": 0-100 }
  ]
}
Include exactly 4 targets in order: recruiter, hiring_manager, team_pm_or_peer, high_signal_connector. One per type. search_query must be a short phrase the user can paste into Google to find LinkedIn. confidence is 0-100.`;

  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 900,
    temperature: 0.3,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  try {
    const raw = content.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(raw) as {
      archetype?: string;
      team_keywords?: string[];
      role_family?: string;
      targets?: Array<{
        target_type?: string;
        search_query?: string;
        why_selected?: string;
        confidence?: number;
      }>;
    };
    const targets = parsed?.targets;
    if (!Array.isArray(targets) || targets.length === 0) return null;

    const out: LLMReferralPayload["targets"] = [];
    for (let i = 0; i < Math.min(4, targets.length); i++) {
      const t = targets[i];
      const type = TARGET_TYPES.includes((t?.target_type ?? "") as (typeof TARGET_TYPES)[number])
        ? (t!.target_type as (typeof TARGET_TYPES)[number])
        : TARGET_TYPES[i] ?? "high_signal_connector";
      const search_query = (t?.search_query ?? "").trim() || `${job.company} ${type.replace(/_/g, " ")} LinkedIn`;
      const why_selected = (t?.why_selected ?? "").trim() || "Suggested by Referral Target Finder.";
      const confidence = typeof t?.confidence === "number" ? Math.min(100, Math.max(0, t.confidence)) : 70;
      out.push({ target_type: type, search_query, why_selected, confidence });
    }
    return {
      archetype: typeof parsed.archetype === "string" ? parsed.archetype.trim() : undefined,
      team_keywords: Array.isArray(parsed.team_keywords) ? parsed.team_keywords.slice(0, 3).filter((k) => typeof k === "string") : undefined,
      role_family: typeof parsed.role_family === "string" ? parsed.role_family.trim() : undefined,
      targets: out,
    };
  } catch {
    return null;
  }
}

/** Build search_url from search_query (append LinkedIn if not present). */
export function llmTargetToSearchUrl(searchQuery: string, company: string): string {
  const q = searchQuery.trim();
  const withLinkedIn = q.toLowerCase().includes("linkedin") ? q : `${q} ${company} LinkedIn`;
  return buildSearchUrl(withLinkedIn);
}
