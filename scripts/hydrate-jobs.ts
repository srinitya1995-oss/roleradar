/**
 * Fetch full job description for jobs with needs_hydration=1, then re-score and bucket.
 * Run: npx tsx scripts/hydrate-jobs.ts
 * Greenhouse: uses boards-api.greenhouse.io/v1/boards/{token}/jobs/{id} for content.
 * Workday: fetches job URL HTML and extracts main content.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import axios from "axios";
import * as cheerio from "cheerio";
import { db } from "../src/lib/db";
import { passesGate4 } from "../src/lib/gates";
import { computeFinalFitScore } from "../src/lib/scoring";
import { computeBucket } from "../src/lib/buckets";
import { profileMatchScore } from "../src/lib/profile";
import { generateSuggestionsForNearMatch } from "../src/lib/suggestions";
import { parseWorkdayBoard } from "../src/lib/parsers/workday";

type Row = { id: number; source_id: number; external_id: string; title: string | null; url: string; parser: string; source_url: string };
const NEED_HYDRATION = db.prepare(`
  SELECT j.id, j.source_id, j.external_id, j.title, j.url, s.parser, s.url AS source_url
  FROM jobs j
  JOIN job_sources s ON j.source_id = s.id
  WHERE j.needs_hydration = 1 AND j.url IS NOT NULL AND j.url != ''
`);

const updateJob = db.prepare(`
  UPDATE jobs SET description = ?, needs_hydration = 0, final_fit_score = ?, resume_match = ?, bucket = ?, suggestions_json = ? WHERE id = ?
`);
const updateJobUrlAndExternalId = db.prepare(`UPDATE jobs SET url = ?, external_id = ? WHERE id = ?`);

/** Extract board token and job id from Greenhouse job URL (e.g. .../anthropic/jobs/123). */
function parseGreenhouseJobUrl(url: string): { boardToken: string; jobId: string } | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/boards?\/([^/]+)\/jobs\/(\d+)/i) || u.pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
    if (match) return { boardToken: match[1], jobId: match[2] };
  } catch {
    // ignore
  }
  return null;
}

async function fetchGreenhouseDescription(url: string): Promise<string | null> {
  const params = parseGreenhouseJobUrl(url);
  if (!params) return null;
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${params.boardToken}/jobs/${params.jobId}`;
  try {
    const { data } = await axios.get<{ content?: string }>(apiUrl, {
      timeout: 15000,
      headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
    });
    const content = data?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  } catch (err) {
    console.warn("Greenhouse API fetch failed for", url, (err as Error).message);
  }
  // Fallback: scrape job page HTML (some boards don't expose content in API)
  try {
    const { data: html } = await axios.get<string>(url, {
      timeout: 15000,
      headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
    });
    const $ = cheerio.load(html);
    const selectors = ["#content", ".content", "[data-site='job-description']", ".job-description", "main", "article"];
    for (const sel of selectors) {
      const text = $(sel).first().text().trim();
      if (text.length > 150) return text.slice(0, 50000);
    }
    const body = $("body").text().trim();
    if (body.length > 200) return body.slice(0, 15000);
  } catch (err) {
    console.warn("Greenhouse HTML fallback failed for", url, (err as Error).message);
  }
  return null;
}

/** Parse Workday job URL to get baseUrl, tenant, site, and job id for CXS. */
function parseWorkdayJobUrl(url: string): { baseUrl: string; tenant: string; site: string; jobId: string } | null {
  try {
    const u = new URL(url);
    const baseUrl = u.origin;
    const pathParts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const hostParts = u.hostname.split(".");
    const tenant = hostParts[0] ?? "";
    const site = pathParts[0] ?? "";
    const jobIndex = pathParts.findIndex((p) => p.toLowerCase() === "job");
    const idSegment = jobIndex >= 0 && pathParts[jobIndex + 1] != null ? pathParts[jobIndex + 1] : pathParts[pathParts.length - 1];
    if (!tenant || !site || !idSegment) return null;
    return { baseUrl, tenant, site, jobId: idSegment };
  } catch {
    return null;
  }
}

/** Try Workday CXS job-detail endpoint (GET .../job/{id}); not all tenants support it. */
async function fetchWorkdayDescriptionViaCxs(url: string, externalId: string): Promise<string | null> {
  const params = parseWorkdayJobUrl(url);
  if (!params) return null;
  const jobId = externalId || params.jobId;
  const cxsJobUrl = `${params.baseUrl}/wday/cxs/${params.tenant}/${params.site}/job/${jobId}`;
  try {
    const { data } = await axios.get<{ jobPosting?: { jobDescription?: { text?: string }; jobDescriptionSummary?: string } }>(cxsJobUrl, {
      timeout: 10000,
      headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)", Accept: "application/json" },
    });
    const desc = data?.jobPosting?.jobDescription?.text ?? data?.jobPosting?.jobDescriptionSummary;
    if (typeof desc === "string" && desc.trim().length > 100) return desc.trim();
  } catch {
    // CXS job detail not supported for this tenant
  }
  return null;
}

/** Extract job description from Workday page HTML: embedded JSON or common selectors. */
function extractWorkdayDescriptionFromHtml(html: string): string | null {
  const $ = cheerio.load(html);

  const walk = (obj: unknown): string | null => {
    if (obj == null) return null;
    if (typeof obj === "string" && obj.length > 150) return obj;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const t = walk(item);
        if (t) return t;
      }
      return null;
    }
    if (typeof obj === "object") {
      const key = obj as Record<string, unknown>;
      const desc =
        key.jobDescription ?? key.job_description ?? key.description ?? key.text ?? key.body ?? key.content;
      if (desc && typeof desc === "string" && desc.length > 100) return desc;
      if (key.jobPosting && typeof key.jobPosting === "object") return walk(key.jobPosting) ?? null;
      for (const v of Object.values(key)) {
        const t = walk(v);
        if (t) return t;
      }
    }
    return null;
  };

  // 1) Script tags with JSON (e.g. __WD_CONTEXT__, jobPosting, jobDescription)
  const scripts = $('script[type="application/json"], script:not([type])');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).html();
    if (!raw || raw.length < 200) continue;
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const text = walk(data);
      if (text) return text;
    } catch {
      // not JSON
    }
  }

  // 2) Standard Workday / Adobe selectors
  const selectors = [
    '[data-automation-id="jobPostingDescription"]',
    "[data-automation-id='jobPostingDescription']",
    ".job-description",
    ".content",
    "#jobPostingDescription",
    "[class*='jobPostingDescription']",
    "[class*='JobDescription']",
    "article",
    "main",
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text.length > 100) return text.slice(0, 50000);
  }

  const body = $("body").text().trim();
  if (body.length > 200) return body.slice(0, 15000);
  return null;
}

async function fetchWorkdayDescription(url: string, externalId?: string): Promise<string | null> {
  // 1) Try CXS job-detail endpoint (some Workday tenants expose it)
  if (externalId) {
    const viaCxs = await fetchWorkdayDescriptionViaCxs(url, externalId);
    if (viaCxs) return viaCxs;
  }

  // 2) Fetch job page and extract from embedded JSON or HTML
  try {
    const { data: html } = await axios.get<string>(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const fromHtml = extractWorkdayDescriptionFromHtml(html);
    if (fromHtml) return fromHtml;
  } catch (err) {
    console.warn("Workday fetch failed for", url, (err as Error).message);
  }
  return null;
}

/** Normalize title for matching (lowercase, collapse spaces). */
function normTitle(t: string | null): string {
  if (t == null) return "";
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[&]/g, " ")
    .trim();
}

/** If Workday job has broken url (e.g. .../job/undefined), re-fetch board and match by title; update DB. */
async function repairWorkdayRow(row: Row): Promise<{ ok: true; row: Row } | { ok: false; reason: string }> {
  if (row.parser !== "workday" || (!row.url.includes("undefined") && row.external_id)) return { ok: false, reason: "skip" };
  try {
    const jobs = await parseWorkdayBoard(row.source_url);
    if (jobs.length === 0) {
      return { ok: false, reason: "board returned 0 jobs (site may be JS-rendered or use a different API)" };
    }
    const want = normTitle(row.title);
    let match = want ? jobs.find((j) => {
      const n = normTitle(j.title);
      return n === want || n.includes(want) || want.includes(n) || (n.length > 20 && want.length > 20 && n.slice(0, 40) === want.slice(0, 40));
    }) : null;
    if (!match && jobs.length === 1) match = jobs[0];
    if (match) {
      updateJobUrlAndExternalId.run(match.url, match.external_id, row.id);
      (row as Row & { url: string; external_id: string }).url = match.url;
      (row as Row & { url: string; external_id: string }).external_id = match.external_id;
      return { ok: true, row };
    }
    return { ok: false, reason: `no title match among ${jobs.length} jobs from board` };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

async function hydrateOne(row: Row): Promise<{ ok: boolean; reason?: string }> {
  if (row.parser === "workday" && (row.url.includes("undefined") || !row.external_id)) {
    const repair = await repairWorkdayRow(row);
    if (!repair.ok) {
      const reason = repair.reason === "skip" ? "broken Workday url (no id) and could not repair from board" : repair.reason;
      return { ok: false, reason: `Workday: ${reason}` };
    }
  }

  let description: string | null = null;
  if (row.parser === "greenhouse") description = await fetchGreenhouseDescription(row.url);
  else if (row.parser === "workday") description = await fetchWorkdayDescription(row.url, row.external_id || undefined);
  else return { ok: false, reason: "parser not greenhouse/workday" };

  if (!description) {
    return { ok: false, reason: `no description from ${row.parser} (url: ${row.url.slice(0, 60)}...)` };
  }

  const title = row.title ?? null;
  if (!passesGate4(title, description)) {
    updateJob.run(description, 0, 0, "HIDE", null, row.id);
    return { ok: true };
  }
  const final_fit_score = computeFinalFitScore(title, description);
  const resume_match = profileMatchScore(title, description);
  const bucket = computeBucket(resume_match, final_fit_score);
  const suggestions_json =
    bucket === "NEAR_MATCH"
      ? JSON.stringify(generateSuggestionsForNearMatch(title, description))
      : null;
  updateJob.run(description, final_fit_score, resume_match, bucket, suggestions_json, row.id);
  return { ok: true };
}

/** One-time: mark existing jobs with empty description (greenhouse/workday) as needs_hydration=1. */
function backfillNeedsHydration(): number {
  const result = db.prepare(`
    UPDATE jobs SET needs_hydration = 1
    WHERE needs_hydration = 0
      AND (description IS NULL OR trim(description) = '')
      AND source_id IN (SELECT id FROM job_sources WHERE parser IN ('greenhouse', 'workday'))
  `).run();
  return result.changes;
}

async function main() {
  const doBackfill = process.argv.includes("--backfill");
  if (doBackfill) {
    const n = backfillNeedsHydration();
    console.log(`Backfill: marked ${n} existing jobs (empty description, greenhouse/workday) as needs_hydration=1.`);
  }

  const rows = NEED_HYDRATION.all() as Row[];
  console.log(`Hydrating ${rows.length} jobs (needs_hydration=1)...`);
  let done = 0;
  for (const row of rows) {
    const result = await hydrateOne(row);
    if (result.ok) done++;
    else console.warn(`  Skip id=${row.id} "${(row.title ?? "").slice(0, 50)}": ${result.reason ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`Done. Hydrated ${done}/${rows.length} jobs.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
