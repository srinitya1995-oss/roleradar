/**
 * Referral targets v2. Eligibility, heuristic (archetype + team keywords), confidence, source.
 * Persisted in job_referral_targets (search_query, search_url, why_selected, confidence, archetype, source).
 */

import { db } from "./db";
import { connectNote } from "./messages";
import { getSettings } from "./settings";
import { classifyJobArchetype, generateHeuristicTargetsV2 } from "./referral-v2";
import { getRecommendationsForJob } from "./recommendations";

export type TargetType = "recruiter" | "hiring_manager" | "team_pm_or_peer" | "high_signal_connector";

export type ReferralTargetRow = {
  job_id: number;
  slot: number;
  target_type: string;
  search_query: string | null;
  search_url: string;
  why_selected: string;
  confidence: number | null;
  archetype: string | null;
  source: string | null;
  outreach_status: string;
  drafted_message: string;
};

const OUTREACH_STATUSES = ["queued", "sent", "responded"] as const;

const REFERRAL_SELECT =
  "SELECT job_id, slot, target_type, search_query, search_url, why_selected, confidence, archetype, source, outreach_status, drafted_message FROM job_referral_targets";

/**
 * Legacy: (tier in {Top 5%, Top 20%}) OR (cpi != null && cpi >= 7). Not used; API uses needConnectionsV2(bucket, finalFitScore).
 * @deprecated Use needConnectionsV2(bucket, final_fit_score) instead.
 */
export function eligibleForConnections(tier: string | null, cpi: number | null): boolean {
  if (tier === "Top 5%" || tier === "Top 20%") return true;
  return cpi != null && cpi >= 7;
}

/** V2: needConnections = FINAL_FIT_SCORE >= 75 OR bucket in {APPLY_NOW, STRONG_FIT, NEAR_MATCH} */
export function needConnectionsV2(bucket: string | null, finalFitScore: number): boolean {
  if (finalFitScore >= 75) return true;
  return bucket === "APPLY_NOW" || bucket === "STRONG_FIT" || bucket === "NEAR_MATCH";
}

function getJobContext(jobId: number): {
  title: string | null;
  description: string | null;
  location: string | null;
  company: string;
} | null {
  const row = db
    .prepare(
      `SELECT j.title, j.description, j.location, s.company
       FROM jobs j
       LEFT JOIN job_sources s ON j.source_id = s.id
       WHERE j.id = ?`
    )
    .get(jobId) as { title: string | null; description: string | null; location: string | null; company: string | null } | undefined;
  if (!row) return null;
  return {
    title: row.title ?? null,
    description: row.description ?? null,
    location: row.location ?? null,
    company: (row.company ?? "").trim() || "Company",
  };
}

/** Connector from people pool: first recommendation for this job (same company). */
function getConnectorFromPeoplePool(jobId: number, company: string): { name: string; search_query: string } | null {
  const recs = getRecommendationsForJob(jobId);
  const companyLower = company.trim().toLowerCase();
  const first = recs.find((r) => (r.person.company ?? "").trim().toLowerCase() === companyLower);
  if (!first) return null;
  return {
    name: first.person.name,
    search_query: `${first.person.name} ${company} LinkedIn`,
  };
}

/** Get or create referral targets v2 (heuristic with archetype + confidence). */
export function getOrCreateReferralTargetsForJob(jobId: number): ReferralTargetRow[] {
  const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(jobId) as { id: number } | undefined;
  if (!job) return [];

  const settings = getSettings();
  const maxTargets = Math.min(Math.max(1, settings.max_targets_per_job), 4);

  const existing = db.prepare(`${REFERRAL_SELECT} WHERE job_id = ? ORDER BY slot`).all(jobId) as ReferralTargetRow[];
  if (existing.length >= maxTargets) return existing.slice(0, maxTargets);

  const ctx = getJobContext(jobId);
  if (!ctx) return existing;

  const classification = classifyJobArchetype(ctx.title, ctx.description, ctx.location);
  const connector = getConnectorFromPeoplePool(jobId, ctx.company);
  const slots = generateHeuristicTargetsV2(ctx.company, classification, connector);

  const extId = (db.prepare("SELECT external_id FROM jobs WHERE id = ?").get(jobId) as { external_id: string | null })?.external_id ?? String(jobId);
  const displayNames: Record<string, string> = {
    recruiter: "Recruiter",
    hiring_manager: "Hiring Manager",
    team_pm_or_peer: "Team PM / Peer",
    high_signal_connector: "High-Signal Connector",
  };

  const insertStmt = db.prepare(`
    INSERT INTO job_referral_targets (job_id, slot, target_type, search_query, search_url, why_selected, confidence, archetype, source, outreach_status, drafted_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
    ON CONFLICT(job_id, slot) DO UPDATE SET
      target_type = excluded.target_type,
      search_query = excluded.search_query,
      search_url = excluded.search_url,
      why_selected = excluded.why_selected,
      confidence = excluded.confidence,
      archetype = excluded.archetype,
      source = excluded.source,
      drafted_message = excluded.drafted_message
  `);

  for (let i = 0; i < maxTargets && i < slots.length; i++) {
    const s = slots[i];
    const draftedMessage = connectNote(displayNames[s.target_type] ?? s.target_type, extId);
    insertStmt.run(
      jobId,
      s.slot,
      s.target_type,
      s.search_query,
      s.search_url,
      s.why_selected,
      s.confidence,
      s.archetype,
      s.source,
      draftedMessage
    );
  }
  db.prepare("DELETE FROM job_referral_targets WHERE job_id = ? AND slot > ?").run(jobId, maxTargets);

  return db.prepare(`${REFERRAL_SELECT} WHERE job_id = ? ORDER BY slot`).all(jobId) as ReferralTargetRow[];
}

export function getReferralTargetsForJob(jobId: number): ReferralTargetRow[] {
  return db.prepare(`${REFERRAL_SELECT} WHERE job_id = ? ORDER BY slot`).all(jobId) as ReferralTargetRow[];
}

const SLOT_ORDER: TargetType[] = ["recruiter", "hiring_manager", "team_pm_or_peer", "high_signal_connector"];

/** Merge LLM targets with heuristic to fill up to 4 slots. Uses LLM per type when present; fills missing with heuristic. */
export function mergeReferralTargetsLlmWithHeuristic(
  jobId: number,
  llmTargets: Array<{ target_type: string; search_query: string; why_selected: string; confidence?: number }>,
  company: string
): Array<{ slot: number; target_type: string; search_query: string; search_url: string; why_selected: string; confidence: number; archetype: string | null; source: string; drafted_message: string }> {
  const ctx = getJobContext(jobId);
  if (!ctx) return [];
  const classification = classifyJobArchetype(ctx.title, ctx.description, ctx.location);
  const connector = getConnectorFromPeoplePool(jobId, ctx.company);
  const heuristicSlots = generateHeuristicTargetsV2(ctx.company, classification, connector);
  const extId = (db.prepare("SELECT external_id FROM jobs WHERE id = ?").get(jobId) as { external_id: string | null })?.external_id ?? String(jobId);
  const displayNames: Record<string, string> = {
    recruiter: "Recruiter",
    hiring_manager: "Hiring Manager",
    team_pm_or_peer: "Team PM / Peer",
    high_signal_connector: "High-Signal Connector",
  };
  function buildSearchUrl(q: string): string {
    const encoded = encodeURIComponent(q.replace(/\s+/g, " ").trim());
    return `https://www.google.com/search?q=${encoded}`;
  }
  const out: Array<{ slot: number; target_type: string; search_query: string; search_url: string; why_selected: string; confidence: number; archetype: string | null; source: string; drafted_message: string }> = [];
  const used = new Set<number>();
  for (let slot = 1; slot <= 4; slot++) {
    const wantType = SLOT_ORDER[slot - 1];
    const llmIdx = llmTargets.findIndex((t, i) => !used.has(i) && t.target_type === wantType);
    const heuristic = heuristicSlots[slot - 1];
    if (llmIdx >= 0) {
      used.add(llmIdx);
      const llm = llmTargets[llmIdx]!;
      const search_url = buildSearchUrl(llm.search_query);
      out.push({
        slot,
        target_type: wantType,
        search_query: llm.search_query,
        search_url,
        why_selected: llm.why_selected,
        confidence: typeof llm.confidence === "number" ? Math.min(100, Math.max(0, llm.confidence)) : 70,
        archetype: classification.archetype,
        source: "llm",
        drafted_message: connectNote(displayNames[wantType] ?? wantType, extId),
      });
    } else if (heuristic) {
      out.push({
        slot,
        target_type: heuristic.target_type,
        search_query: heuristic.search_query,
        search_url: heuristic.search_url,
        why_selected: heuristic.why_selected,
        confidence: heuristic.confidence,
        archetype: heuristic.archetype,
        source: heuristic.source,
        drafted_message: connectNote(displayNames[heuristic.target_type] ?? heuristic.target_type, extId),
      });
    }
  }
  return out;
}

/** Save pre-built referral targets (e.g. from LLM). Replaces existing; includes search_query, confidence, archetype, source. */
export function saveReferralTargets(
  jobId: number,
  targets: Array<{
    slot: number;
    target_type: string;
    search_query: string;
    search_url: string;
    why_selected: string;
    confidence: number;
    archetype: string | null;
    source: string;
    drafted_message: string;
  }>
): void {
  const settings = getSettings();
  const maxTargets = Math.min(Math.max(1, settings.max_targets_per_job), 4);
  db.prepare("DELETE FROM job_referral_targets WHERE job_id = ?").run(jobId);
  const insertStmt = db.prepare(`
    INSERT INTO job_referral_targets (job_id, slot, target_type, search_query, search_url, why_selected, confidence, archetype, source, outreach_status, drafted_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
  `);
  for (let i = 0; i < maxTargets && i < targets.length; i++) {
    const t = targets[i];
    insertStmt.run(
      jobId,
      t.slot,
      t.target_type,
      t.search_query,
      t.search_url,
      t.why_selected,
      t.confidence,
      t.archetype ?? null,
      t.source,
      t.drafted_message
    );
  }
}

export function updateReferralTargetStatus(jobId: number, slot: number, outreachStatus: string): void {
  if (!OUTREACH_STATUSES.includes(outreachStatus as (typeof OUTREACH_STATUSES)[number])) return;
  db.prepare("UPDATE job_referral_targets SET outreach_status = ? WHERE job_id = ? AND slot = ?").run(
    outreachStatus,
    jobId,
    slot
  );
}
