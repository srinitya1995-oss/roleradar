/**
 * Shared jobs list API logic. Used by app/api/jobs/list/route.ts and pages/api/jobs.ts.
 * Canonical: recency_days (posted_at OR first_seen_at), locationEligible (CA/Seattle; no remote unless allow_remote), bucket as source of truth.
 */
import { db } from "@/src/lib/db";
import { profileMatchScore } from "@/src/lib/profile";
import { needConnectionsV2 } from "@/src/lib/referral-targets";
import { getSettings } from "@/src/lib/settings";
import { locationEligible } from "@/src/lib/location";
import { computeBucket, type Bucket } from "@/src/lib/buckets";

export type JobRow = {
  id: number;
  title: string | null;
  location: string | null;
  url: string | null;
  external_id: string | null;
  cpi: number | null;
  tier: string | null;
  description: string | null;
  created_at: string | null;
  posted_at: string | null;
  reposted_at: string | null;
  company: string | null;
  first_seen_at: string | null;
  final_fit_score: number | null;
  resume_match: number | null;
  bucket: string | null;
  tracking_status: string | null;
};

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Use stored bucket when non-null and valid; only derive for legacy rows not yet backfilled. */
function effectiveBucket(r: JobRow): Bucket {
  if (r.bucket && ["APPLY_NOW", "STRONG_FIT", "NEAR_MATCH", "REVIEW", "HIDE"].includes(r.bucket))
    return r.bucket as Bucket;
  const resume = r.resume_match ?? profileMatchScore(r.title, r.description);
  const fit = r.final_fit_score ?? (r.cpi != null ? r.cpi * 10 : 0);
  return computeBucket(resume, fit);
}

export function getJobsPayload(): {
  top5: unknown[];
  top20: unknown[];
  rejectedRelevantOnly: unknown[];
  reject: unknown[];
  other: unknown[];
  interested: unknown[];
  jobsByCompany: { company: string; jobs: unknown[] }[];
} {
  const settings = getSettings();
  // Inbox list: jobs posted in the last 7 days
  const recencyDays = 7;
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneHourAgo = oneHourAgoIso.slice(0, 19).replace("T", " ");
  const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = oneDayAgoIso.slice(0, 19).replace("T", " ");
  const rows = db.prepare(`
  SELECT j.id, j.title, j.location, j.url, j.external_id, j.cpi, j.tier, j.description, j.created_at, j.posted_at, j.reposted_at, j.first_seen_at, j.final_fit_score, j.resume_match, j.bucket, j.tracking_status, COALESCE(j.company, s.company) as company
  FROM jobs j
  LEFT JOIN job_sources s ON j.source_id = s.id
  WHERE (COALESCE(j.reposted_at, j.posted_at, j.first_seen_at, j.created_at) >= datetime('now', '-${recencyDays} days'))
  ORDER BY COALESCE(j.reposted_at, j.posted_at, j.first_seen_at, j.created_at) DESC, j.final_fit_score DESC NULLS LAST, j.cpi DESC NULLS LAST, j.id DESC
`).all() as JobRow[];

  const dedupeKey = (r: JobRow) => `${(r.company ?? "").trim().toLowerCase()}|${normalizeTitle(r.title)}`;
  const seen = new Set<string>();
  const deduped: JobRow[] = [];
  for (const r of rows) {
    const key = dedupeKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  const byLocation = (r: JobRow) => locationEligible(r.location, settings.allowed_locations, settings.allow_remote);
  const isNotIndeed = (r: JobRow) => (r.company ?? "").trim().toLowerCase() !== "indeed";
  const eligible = deduped.filter(byLocation).filter(isNotIndeed);

  const apply_now = eligible.filter((r) => effectiveBucket(r) === "APPLY_NOW");
  const strong_fit = eligible.filter((r) => effectiveBucket(r) === "STRONG_FIT");
  const near_match = eligible.filter((r) => effectiveBucket(r) === "NEAR_MATCH");
  const review = eligible.filter((r) => effectiveBucket(r) === "REVIEW");
  const hide = eligible.filter((r) => effectiveBucket(r) === "HIDE");

  const allJobs = [...apply_now, ...strong_fit, ...near_match, ...review, ...hide];

  const jobIds = allJobs.map((r) => r.id);
  const targetsByJob: Record<number, { target_type: string; why_selected: string; confidence: number | null; search_url: string }[]> = {};
  const targetsOldestCreatedAt: Record<number, string | null> = {};
  if (jobIds.length > 0) {
    const placeholders = jobIds.map(() => "?").join(",");
    const targetRows = db
      .prepare(
        `SELECT job_id, slot, target_type, search_url, why_selected, confidence, created_at FROM job_referral_targets WHERE job_id IN (${placeholders}) ORDER BY job_id, slot`
      )
      .all(...jobIds) as { job_id: number; target_type: string; search_url: string; why_selected: string; confidence: number | null; created_at: string | null }[];
    for (const t of targetRows) {
      if (!targetsByJob[t.job_id]) targetsByJob[t.job_id] = [];
      targetsByJob[t.job_id].push({
        target_type: t.target_type,
        why_selected: t.why_selected,
        confidence: t.confidence ?? null,
        search_url: t.search_url ?? "",
      });
      const existing = targetsOldestCreatedAt[t.job_id];
      if (!existing || (t.created_at && t.created_at < existing)) targetsOldestCreatedAt[t.job_id] = t.created_at ?? null;
    }
  }

  const targetTypeLabel = (type: string): string => {
    const m: Record<string, string> = {
      recruiter: "Recruiter",
      hiring_manager: "Hiring Manager",
      high_signal_connector: "High-Signal Connector",
      team_pm_or_peer: "Team PM / Peer",
    };
    return m[type] ?? type;
  };

  function matchLabel(r: JobRow, resumeMatch: number, finalFitScore: number): string {
    if (resumeMatch >= 80 && finalFitScore >= 80) return "Resume match";
    if (resumeMatch >= 70 && finalFitScore >= 75) return "Good match";
    if (resumeMatch >= 60 && finalFitScore >= 65) return "Good match (minor edits)";
    if (resumeMatch >= 50) return "Review";
    return "Review";
  }

  const staleCutoff = new Date(Date.now() - settings.target_stale_days * 24 * 60 * 60 * 1000).toISOString();

  const toPayload = (jobs: JobRow[], bucket: string) =>
    jobs.map((r) => {
      const resumeMatch = r.resume_match ?? profileMatchScore(r.title, r.description);
      const final_fit_score = r.final_fit_score ?? (r.cpi != null ? r.cpi * 10 : 0);
      const match_pct = Math.round(0.5 * resumeMatch + 0.5 * Math.min(100, final_fit_score));
      const needConnections = needConnectionsV2(bucket, final_fit_score);
      const targets = targetsByJob[r.id] ?? [];
      const oldestTarget = targetsOldestCreatedAt[r.id];
      let connection_status: string;
      if (!needConnections) connection_status = "n/a";
      else if (targets.length === 0) connection_status = "not_found";
      else if (oldestTarget && oldestTarget < staleCutoff) connection_status = "stale";
      else connection_status = "found";
      const connection_targets =
        targets.length > 0
          ? targets.map((t) => ({
              type_label: targetTypeLabel(t.target_type),
              why_selected: t.why_selected,
              confidence: t.confidence,
              search_url: t.search_url,
            }))
          : [];
      const date_posted = r.reposted_at ?? r.posted_at ?? r.first_seen_at ?? r.created_at ?? null;
      let age_group: "new" | "last_24h" | "older" = "older";
      if (date_posted) {
        if (date_posted >= oneHourAgo) age_group = "new";
        else if (date_posted >= oneDayAgo) age_group = "last_24h";
      }
      return {
        id: r.id,
        title: r.title,
        location: r.location,
        url: r.url,
        external_id: r.external_id,
        cpi: r.cpi,
        tier: r.tier,
        company: r.company ?? null,
        date_posted,
        is_new: age_group === "new",
        age_group,
        match_label: matchLabel(r, resumeMatch, final_fit_score),
        profile_match_pct: resumeMatch,
        match_pct,
        bucket,
        final_fit_score,
        connection_status,
        connection_targets,
        tracking_status: r.tracking_status ?? null,
      };
    });

  const payloadApplyNow = toPayload(apply_now, "APPLY_NOW");
  const payloadStrongFit = toPayload(strong_fit, "STRONG_FIT");
  const payloadNearMatch = toPayload(near_match, "NEAR_MATCH");
  const payloadReview = toPayload(review, "REVIEW");
  const payloadHide = toPayload(hide, "HIDE");
  const allPayloads = [...payloadApplyNow, ...payloadStrongFit, ...payloadNearMatch, ...payloadReview, ...payloadHide];

  const interested = allPayloads.filter((j) => (j.tracking_status ?? "").trim() !== "");

  const byCompany: Record<string, typeof allPayloads> = {};
  for (const job of allPayloads) {
    const company = (job.company ?? "Other").trim() || "Other";
    if (!byCompany[company]) byCompany[company] = [];
    byCompany[company].push(job);
  }
  const companyNames = Object.keys(byCompany).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return {
    top5: payloadApplyNow,
    top20: payloadStrongFit,
    rejectedRelevantOnly: payloadNearMatch,
    reject: payloadReview,
    other: payloadHide,
    interested,
    jobsByCompany: companyNames.map((company) => ({ company, jobs: byCompany[company]! })),
  };
}
