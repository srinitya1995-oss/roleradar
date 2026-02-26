/**
 * Shared jobs list API logic. Used by app/api/jobs/route.ts and pages/api/jobs.ts.
 */
import { db } from "@/src/lib/db";
import { profileMatchScore } from "@/src/lib/profile";
import { eligibleForConnections } from "@/src/lib/referral-targets";
import {
  getSettings,
  locationMatchesAllowed,
  matchesRejectKeywords,
} from "@/src/lib/settings";

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
  company: string | null;
};

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getJobsPayload(): {
  top5: unknown[];
  top20: unknown[];
  rejectedRelevantOnly: unknown[];
  other: unknown[];
  jobsByCompany: { company: string; jobs: unknown[] }[];
} {
  const settings = getSettings();
  const rows = db.prepare(`
  SELECT j.id, j.title, j.location, j.url, j.external_id, j.cpi, j.tier, j.description, j.created_at, j.posted_at, s.company
  FROM jobs j
  LEFT JOIN job_sources s ON j.source_id = s.id
  WHERE j.created_at >= datetime('now', '-7 days')
  ORDER BY CASE j.tier WHEN 'Top 5%' THEN 1 WHEN 'Top 20%' THEN 2 ELSE 3 END, j.cpi DESC, j.id DESC
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

  const byLocation = (r: JobRow) => locationMatchesAllowed(r.location, settings.allowed_locations);

  const top5 = deduped.filter((r) => r.tier === "Top 5%" && byLocation(r));
  const top20 = deduped.filter((r) => r.tier === "Top 20%" && byLocation(r));

  let rejectedRelevantOnly: JobRow[] = [];
  if (settings.show_reject_bucket) {
    const minCpi = settings.reject_cpi_min_to_show;
    const maxCpi = settings.reject_cpi_max_to_show;
    const keywords = settings.reject_must_have_any_keywords;
    rejectedRelevantOnly = deduped.filter((r) => {
      if (!byLocation(r)) return false;
      const cpi = r.cpi;
      if (cpi == null || cpi < minCpi || cpi > maxCpi) return false;
      if (!matchesRejectKeywords(r.title, r.description, keywords)) return false;
      return true;
    });
  }

  const inOther = new Set([...top5, ...top20, ...rejectedRelevantOnly].map((r) => r.id));
  const other = deduped.filter((r) => !inOther.has(r.id));

  const allJobs = [...top5, ...top20, ...rejectedRelevantOnly, ...other];

  const jobIds = allJobs.map((r) => r.id);
  const targetsByJob: Record<number, { target_type: string; why_selected: string; confidence: number | null }[]> = {};
  if (jobIds.length > 0) {
    const placeholders = jobIds.map(() => "?").join(",");
    const targetRows = db
      .prepare(
        `SELECT job_id, slot, target_type, why_selected, confidence FROM job_referral_targets WHERE job_id IN (${placeholders}) ORDER BY job_id, slot`
      )
      .all(...jobIds) as { job_id: number; target_type: string; why_selected: string; confidence: number | null }[];
    for (const t of targetRows) {
      if (!targetsByJob[t.job_id]) targetsByJob[t.job_id] = [];
      targetsByJob[t.job_id].push({ target_type: t.target_type, why_selected: t.why_selected, confidence: t.confidence ?? null });
    }
  }

  const targetTypeLabel = (type: string): string => {
    const m: Record<string, string> = {
      recruiter: "Recruiter",
      hiring_manager: "Hiring Manager",
      high_signal_connector: "High-Signal Connector",
    };
    return m[type] ?? type;
  };

  function matchLabel(r: JobRow, profilePct: number): string {
    if (profilePct >= 70 && r.cpi != null && r.cpi >= 7) return "Resume match";
    if (r.tier === "Top 5%") return "Resume match";
    if (r.tier === "Top 20%") return "Good match";
    if (r.cpi != null && r.cpi >= 5 && r.cpi <= 6) return "Good match (minor edits)";
    if (profilePct >= 50) return "Good match (minor edits)";
    return "Review";
  }

  const toPayload = (jobs: JobRow[]) =>
    jobs.map((r) => {
      const profilePct = profileMatchScore(r.title, r.description);
      const cpiPct = r.cpi != null ? (r.cpi / 10) * 100 : 0;
      const match_pct = r.cpi != null
        ? Math.round(0.5 * cpiPct + 0.5 * profilePct)
        : profilePct;
      const targets = targetsByJob[r.id] ?? [];
      const eligible = eligibleForConnections(r.tier ?? null, r.cpi ?? null);
      const connection_status = !eligible ? "n/a" : targets.length > 0 ? "found" : "not_found";
      const connection_targets =
        targets.length > 0
          ? targets.map((t) => ({
              type_label: targetTypeLabel(t.target_type),
              why_selected: t.why_selected,
              confidence: t.confidence,
            }))
          : [];
      return {
        id: r.id,
        title: r.title,
        location: r.location,
        url: r.url,
        external_id: r.external_id,
        cpi: r.cpi,
        tier: r.tier,
        company: r.company ?? null,
        date_posted: r.posted_at ?? r.created_at ?? null,
        match_label: matchLabel(r, profilePct),
        profile_match_pct: profilePct,
        match_pct,
        connection_status,
        connection_targets,
      };
    });

  const byCompany: Record<string, ReturnType<typeof toPayload>[0][]> = {};
  for (const job of toPayload(allJobs)) {
    const company = (job.company ?? "Other").trim() || "Other";
    if (!byCompany[company]) byCompany[company] = [];
    byCompany[company].push(job);
  }
  const companyNames = Object.keys(byCompany).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return {
    top5: toPayload(top5),
    top20: toPayload(top20),
    rejectedRelevantOnly: toPayload(rejectedRelevantOnly),
    other: toPayload(other),
    jobsByCompany: companyNames.map((company) => ({ company, jobs: byCompany[company]! })),
  };
}
