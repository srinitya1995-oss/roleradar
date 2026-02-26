/**
 * Agent helper: pre-warm referral targets for APPLY_NOW, STRONG_FIT, and top NEAR_MATCH (resume_match >= 88). Cap from settings.
 */
import { db } from "./db";
import {
  getOrCreateReferralTargetsForJob,
  getReferralTargetsForJob,
  saveReferralTargets,
  mergeReferralTargetsLlmWithHeuristic,
} from "./referral-targets";
import { getReferralTargetsFromLLMV2 } from "./referral-llm";
import { getSettings } from "./settings";

/**
 * Jobs eligible for prewarm: bucket APPLY_NOW, STRONG_FIT, or (NEAR_MATCH and resume_match >= 88). No targets yet. Cap from settings.
 */
export function getHighFitJobsWithoutTargets(): { id: number; bucket: string | null; resume_match: number | null }[] {
  const settings = getSettings();
  const cap = Math.max(1, settings.prewarm_cap);
  const rows = db
    .prepare(
      `SELECT j.id, j.bucket, j.resume_match
       FROM jobs j
       WHERE NOT EXISTS (SELECT 1 FROM job_referral_targets t WHERE t.job_id = j.id)
         AND (
           j.bucket = 'APPLY_NOW'
           OR j.bucket = 'STRONG_FIT'
           OR (j.bucket = 'NEAR_MATCH' AND COALESCE(j.resume_match, 0) >= 88)
         )
       ORDER BY CASE j.bucket WHEN 'APPLY_NOW' THEN 1 WHEN 'STRONG_FIT' THEN 2 ELSE 3 END, j.resume_match DESC NULLS LAST, j.final_fit_score DESC NULLS LAST, j.id DESC
       LIMIT ?`
    )
    .all(cap) as { id: number; bucket: string | null; resume_match: number | null }[];
  return rows;
}

/**
 * Pre-warm one job: LLM for APPLY_NOW (or STRONG_FIT with high score) when OPENAI_API_KEY set; else heuristic v2.
 */
export async function warmConnectionsForJob(jobId: number): Promise<boolean> {
  const existing = getReferralTargetsForJob(jobId);
  if (existing.length > 0) return true;

  const row = db
    .prepare(
      `SELECT j.id, j.title, j.description, j.location, j.external_id, j.bucket, j.final_fit_score, s.company
       FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?`
    )
    .get(jobId) as
    | {
        id: number;
        title: string | null;
        description: string | null;
        location: string | null;
        external_id: string | null;
        bucket: string | null;
        final_fit_score: number | null;
        company: string | null;
      }
    | undefined;

  if (!row) return false;

  const company = (row.company ?? "").trim() || "Company";
  const jobIdStr = row.external_id ?? String(jobId);
  const useLLM =
    Boolean(process.env.OPENAI_API_KEY) &&
    (row.bucket === "APPLY_NOW" || (row.bucket === "STRONG_FIT" && (row.final_fit_score ?? 0) >= 82));

  if (useLLM) {
    try {
      const payload = await getReferralTargetsFromLLMV2({
        title: row.title,
        company,
        job_id: jobIdStr,
        description: row.description,
        location: row.location,
      });
      if (payload?.targets?.length) {
        const merged = mergeReferralTargetsLlmWithHeuristic(jobId, payload.targets, company);
        if (merged.length > 0) {
          saveReferralTargets(jobId, merged);
          return true;
        }
      }
    } catch {
      // Fall through to heuristic
    }
  }

  const targets = getOrCreateReferralTargetsForJob(jobId);
  return targets.length > 0;
}

/**
 * Pre-warm connections for eligible jobs (APPLY_NOW, STRONG_FIT, top NEAR_MATCH). Cap from settings.
 */
export async function warmConnectionsForHighFitJobs(): Promise<{ warmed: number; failed: number }> {
  const jobs = getHighFitJobsWithoutTargets();
  let warmed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const ok = await warmConnectionsForJob(job.id);
      if (ok) warmed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { warmed, failed };
}
