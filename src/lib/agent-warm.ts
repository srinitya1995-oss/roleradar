/**
 * Agent helper v2: pre-warm referral targets. Top 5% always; Top 20% only if first_seen (created_at) <= 7 days. Cap 20 jobs/run.
 */
import { db } from "./db";
import { connectNote } from "./messages";
import {
  getOrCreateReferralTargetsForJob,
  getReferralTargetsForJob,
  saveReferralTargets,
} from "./referral-targets";
import { getReferralTargetsFromLLMV2, llmTargetToSearchUrl } from "./referral-llm";

const AGENT_WARM_CAP = 20;

/**
 * Jobs eligible for warm: Top 5% always; Top 20% only if created_at >= now - 7 days. No targets yet. Cap 20.
 */
export function getHighFitJobsWithoutTargets(): { id: number; tier: string | null; cpi: number | null }[] {
  const rows = db
    .prepare(
      `SELECT j.id, j.tier, j.cpi
       FROM jobs j
       WHERE NOT EXISTS (SELECT 1 FROM job_referral_targets t WHERE t.job_id = j.id)
         AND (
           j.tier = 'Top 5%'
           OR (j.tier = 'Top 20%' AND j.created_at >= datetime('now', '-7 days'))
         )
       ORDER BY CASE j.tier WHEN 'Top 5%' THEN 1 WHEN 'Top 20%' THEN 2 ELSE 3 END, j.cpi DESC NULLS LAST, j.id DESC
       LIMIT ?`
    )
    .all(AGENT_WARM_CAP) as { id: number; tier: string | null; cpi: number | null }[];
  return rows;
}

/**
 * Pre-warm one job: LLM for Top 5% when OPENAI_API_KEY set; else heuristic v2.
 */
export async function warmConnectionsForJob(jobId: number): Promise<boolean> {
  const existing = getReferralTargetsForJob(jobId);
  if (existing.length > 0) return true;

  const row = db
    .prepare(
      `SELECT j.id, j.title, j.description, j.location, j.external_id, j.tier, j.cpi, s.company
       FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?`
    )
    .get(jobId) as
    | {
        id: number;
        title: string | null;
        description: string | null;
        location: string | null;
        external_id: string | null;
        tier: string | null;
        cpi: number | null;
        company: string | null;
      }
    | undefined;

  if (!row) return false;

  const company = (row.company ?? "").trim() || "Company";
  const jobIdStr = row.external_id ?? String(jobId);
  const useLLM =
    Boolean(process.env.OPENAI_API_KEY) &&
    (row.tier === "Top 5%" || (row.cpi != null && row.cpi >= 8));

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
        const displayNames: Record<string, string> = {
          recruiter: "Recruiter",
          hiring_manager: "Hiring Manager",
          high_signal_connector: "High-Signal Connector",
        };
        saveReferralTargets(
          jobId,
          payload.targets.map((t, i) => ({
            slot: i + 1,
            target_type: t.target_type,
            search_query: t.search_query,
            search_url: llmTargetToSearchUrl(t.search_query, company),
            why_selected: t.why_selected,
            confidence: t.confidence ?? 70,
            archetype: payload.archetype ?? null,
            source: "llm",
            drafted_message: connectNote(displayNames[t.target_type] ?? t.target_type, jobIdStr),
          }))
        );
        return true;
      }
    } catch {
      // Fall through to heuristic
    }
  }

  const targets = getOrCreateReferralTargetsForJob(jobId);
  return targets.length > 0;
}

/**
 * Pre-warm connections for eligible jobs (Top 5% always, Top 20% if <= 7 days). Cap 20/run.
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
