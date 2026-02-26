/**
 * Referral targets v2: archetype classification + heuristic target generation.
 * classifyJobArchetype() -> { archetype, team_keywords, role_family, location_hint }.
 * generateHeuristicTargetsV2() -> 3 targets with search_query, search_url, why_selected, confidence (0-100), archetype, source.
 */

export type JobArchetype = {
  archetype: string;
  team_keywords: string[];
  role_family: string;
  location_hint: string;
};

const ROLE_FAMILY_TERMS: { pattern: RegExp; family: string }[] = [
  { pattern: /technical\s+product|pm-t|pmt/i, family: "technical product" },
  { pattern: /principal\s+product|principal\s+pm/i, family: "principal product" },
  { pattern: /senior\s+product|senior\s+pm/i, family: "senior product" },
  { pattern: /product\s+manager|product\s+lead/i, family: "product" },
];

const TEAM_KEYWORD_CANDIDATES = [
  "GenAI",
  "Generative AI",
  "Gen AI",
  "LLM",
  "Large Language",
  "Conversational AI",
  "AI",
  "Machine Learning",
  "ML",
  "Product",
  "Alexa",
  "Rufus",
  "Copilot",
  "Agent",
  "Agents",
  "Reasoning",
  "Evaluation",
  "Multimodal",
];

const LOCATION_EXTRACT = [
  { pattern: /(?:based in|location[:\s]+|,\s*)([A-Za-z\s,]+?)(?:\s*\.|\s*$|\n)/gi, fallback: "" },
  { pattern: /(San Francisco|SF|Seattle|Los Angeles|LA|New York|NYC|Remote|California|CA)/gi, fallback: "" },
];

/**
 * Deterministic classification from title + description.
 * Returns archetype label, up to 3 team keywords, role_family, location_hint.
 */
export function classifyJobArchetype(
  title: string | null | undefined,
  description: string | null | undefined,
  location: string | null | undefined = null
): JobArchetype {
  const combined = [title ?? "", description ?? ""].join(" ").toLowerCase();
  const titleOnly = (title ?? "").toLowerCase();
  const locStr = (location ?? "").trim();

  let archetype = "Product Manager";
  for (const { pattern, family } of ROLE_FAMILY_TERMS) {
    if (pattern.test(title ?? "")) {
      archetype = family;
      break;
    }
  }

  const team_keywords: string[] = [];
  for (const kw of TEAM_KEYWORD_CANDIDATES) {
    if (combined.includes(kw.toLowerCase()) && team_keywords.length < 3) {
      team_keywords.push(kw);
    }
  }
  if (team_keywords.length === 0) team_keywords.push("Product");

  let role_family = "product";
  if (titleOnly.includes("technical") || titleOnly.includes("pm-t") || titleOnly.includes("pmt")) {
    role_family = "technical product";
  } else if (titleOnly.includes("principal")) {
    role_family = "principal product";
  } else if (titleOnly.includes("senior")) {
    role_family = "senior product";
  }

  let location_hint = "";
  if (locStr) {
    const m = locStr.match(/(San Francisco|SF|Seattle|Los Angeles|LA|New York|NYC|Remote|California|CA)/i);
    if (m) location_hint = m[1];
    else location_hint = locStr.split(",")[0]?.trim().slice(0, 30) ?? "";
  }

  return { archetype, team_keywords, role_family, location_hint };
}

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query.replace(/\s+/g, " ").trim());
  return `https://www.google.com/search?q=${encoded}`;
}

export type HeuristicTargetV2 = {
  slot: number;
  target_type: "recruiter" | "hiring_manager" | "team_pm_or_peer" | "high_signal_connector";
  search_query: string;
  search_url: string;
  why_selected: string;
  confidence: number;
  archetype: string;
  source: "heuristic";
};

/**
 * Heuristic v2: 4 slots per CONNECTIONS_LOGIC_V2_SPEC — Recruiter, Hiring Manager, Team PM/Peer, High-Signal Connector.
 */
export function generateHeuristicTargetsV2(
  company: string,
  classification: JobArchetype,
  connectorFromPeoplePool: { name: string; search_query: string } | null
): HeuristicTargetV2[] {
  const { role_family, team_keywords, location_hint } = classification;
  const team = team_keywords[0] ?? "Product";
  const loc = location_hint ? ` ${location_hint}` : "";

  const slot1Query = `${company} recruiter ${role_family}${loc} LinkedIn`.trim();
  const slot1: HeuristicTargetV2 = {
    slot: 1,
    target_type: "recruiter",
    search_query: slot1Query,
    search_url: buildSearchUrl(slot1Query),
    why_selected: `Recruiter for ${role_family} roles${location_hint ? ` in ${location_hint}` : ""}; use search to find on LinkedIn.`,
    confidence: 65,
    archetype: classification.archetype,
    source: "heuristic",
  };

  const slot2Query = `${company} Head of Product ${team} LinkedIn`.trim();
  const slot2: HeuristicTargetV2 = {
    slot: 2,
    target_type: "hiring_manager",
    search_query: slot2Query,
    search_url: buildSearchUrl(slot2Query),
    why_selected: `Hiring manager or product lead for ${team}; Head/Director/GPM search.`,
    confidence: 60,
    archetype: classification.archetype,
    source: "heuristic",
  };

  const slot3Query = `${company} product manager ${team}${loc} LinkedIn`.trim();
  const slot3: HeuristicTargetV2 = {
    slot: 3,
    target_type: "team_pm_or_peer",
    search_query: slot3Query,
    search_url: buildSearchUrl(slot3Query),
    why_selected: `Team PM or peer in ${team}; same org / adjacent PM for warm intro.`,
    confidence: 55,
    archetype: classification.archetype,
    source: "heuristic",
  };

  let slot4: HeuristicTargetV2;
  if (connectorFromPeoplePool) {
    slot4 = {
      slot: 4,
      target_type: "high_signal_connector",
      search_query: connectorFromPeoplePool.search_query,
      search_url: buildSearchUrl(connectorFromPeoplePool.search_query),
      why_selected: `From your network: ${connectorFromPeoplePool.name} at ${company}.`,
      confidence: 80,
      archetype: classification.archetype,
      source: "heuristic",
    };
  } else {
    const slot4Query = `${company} ex Amazon Principal Product Manager ${team} LinkedIn`.trim();
    slot4 = {
      slot: 4,
      target_type: "high_signal_connector",
      search_query: slot4Query,
      search_url: buildSearchUrl(slot4Query),
      why_selected: `Ex-Amazon PM at ${company} for referral and shared context; high-signal connector.`,
      confidence: 55,
      archetype: classification.archetype,
      source: "heuristic",
    };
  }

  return [slot1, slot2, slot3, slot4];
}
