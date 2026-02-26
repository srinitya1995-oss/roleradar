/**
 * Referral targets v2. Eligibility, heuristic (archetype + team keywords), confidence, source.
 * Persisted in job_referral_targets (search_query, search_url, why_selected, confidence, archetype, source).
 */

import { db } from "./db";
import { connectNote } from "./messages";
import { getSettings } from "./settings";
import { classifyJobArchetype, generateHeuristicTargetsV2 } from "./referral-v2";
import { getRecommendationsForJob } from "./recommendations";

export type TargetType = "recruiter" | "hiring_manager" | "high_signal_connector";

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

/** eligibleForConnections = (tier in {Top 5%, Top 20%}) OR (cpi != null && cpi >= 7) */
export function eligibleForConnections(tier: string | null, cpi: number | null): boolean {
  if (tier === "Top 5%" || tier === "Top 20%") return true;
  return cpi != null && cpi >= 7;
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
  const maxTargets = Math.min(Math.max(1, settings.max_targets_per_job), 3);

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
  const maxTargets = Math.min(Math.max(1, settings.max_targets_per_job), 3);
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
