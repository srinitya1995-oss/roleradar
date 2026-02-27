/**
 * Poll enabled job_sources, run parser, insert new jobs. Dedup by external_id per source.
 * Gates: PM/PM-T/seniority + location (CA/Seattle; no remote-only unless allow_remote).
 * Store final_fit_score, resume_match, bucket (APPLY_NOW / STRONG_FIT / NEAR_MATCH / REVIEW / HIDE).
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { db } from "../src/lib/db";
import { parseGreenhouseBoard } from "../src/lib/parsers/greenhouse";
import { parseLeverBoard } from "../src/lib/parsers/lever";
import { parseAshbyBoard } from "../src/lib/parsers/ashby";
import { parseSmartRecruitersBoard } from "../src/lib/parsers/smartrecruiters";
import { parseWorkdayBoard } from "../src/lib/parsers/workday";
import { parseLinkedInJobs } from "../src/lib/parsers/linkedin";
import { parseAdzunaJobs } from "../src/lib/parsers/adzuna";
import { parseJSearchJobs } from "../src/lib/parsers/jsearch";
import { passesTitleAndDescriptionGates } from "../src/lib/gates";
import { getSettings } from "../src/lib/settings";
import { locationEligible } from "../src/lib/location";
import { getPollIntervalMinutesForTier } from "../src/lib/source-tiers";
import { computeFinalFitScore } from "../src/lib/scoring";
import { computeBucket } from "../src/lib/buckets";
import { profileMatchScore } from "../src/lib/profile";
import { generateSuggestionsForNearMatch } from "../src/lib/suggestions";

type JobSource = { id: number; company: string; url: string; parser: string; company_tier: number | null; last_polled_at: string | null };
type ParsedJob = { title: string; url: string; location: string; external_id: string; description?: string; posted_at?: string | null; company?: string };

const parsers: Record<string, (url: string) => Promise<ParsedJob[]>> = {
  greenhouse: parseGreenhouseBoard,
  lever: parseLeverBoard,
  ashby: parseAshbyBoard,
  smartrecruiters: parseSmartRecruitersBoard,
  workday: parseWorkdayBoard,
  linkedin: parseLinkedInJobs,
  adzuna: parseAdzunaJobs,
  jsearch: parseJSearchJobs,
};

const insertJob = db.prepare(`
  INSERT INTO jobs (source_id, external_id, title, location, url, description, cpi, tier, created_at, posted_at, first_seen_at, last_seen_at, final_fit_score, resume_match, bucket, suggestions_json, company)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?)
`);

function getExistingExternalIds(sourceId: number): Set<string> {
  const rows = db.prepare("SELECT external_id FROM jobs WHERE source_id = ?").all(sourceId) as { external_id: string }[];
  return new Set(rows.map((r) => r.external_id ?? ""));
}

export type InsertedJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  final_fit_score: number;
  resume_match: number;
  bucket: string;
};

/** V2: source is "due" if never polled or last_polled_at + tier interval has passed. */
function sourceDue(source: JobSource): boolean {
  const tier = source.company_tier ?? 3;
  const intervalMs = getPollIntervalMinutesForTier(tier) * 60 * 1000;
  const last = source.last_polled_at ? new Date(source.last_polled_at).getTime() : 0;
  return last + intervalMs <= Date.now();
}

const updateLastPolled = db.prepare("UPDATE job_sources SET last_polled_at = datetime('now') WHERE id = ?");

/** Run one poll cycle; exported for use by agent. V2: only polls sources that are due by tier (30min/2hr/daily), unless force. */
export async function runPoll(forceAll = false): Promise<{ count: number; inserted: InsertedJob[] }> {
  const allSources = db.prepare(
    "SELECT id, company, url, parser, company_tier, last_polled_at FROM job_sources WHERE enabled = 1"
  ).all() as JobSource[];
  const sources = forceAll ? allSources : allSources.filter(sourceDue);
  if (forceAll && allSources.length) console.log(`Force poll: running all ${allSources.length} enabled sources.`);
  if (!sources.length) {
    console.log("No sources due to poll (run with --force to poll all enabled sources).");
  }
  let totalInserted = 0;
  const inserted: InsertedJob[] = [];

  for (const source of sources) {
    const run = parsers[source.parser];
    if (!run) {
      console.warn(`Unknown parser: ${source.parser} for ${source.company}`);
      continue;
    }
    try {
      const jobs = await run(source.url);
      const settings = getSettings();
      const existing = getExistingExternalIds(source.id);
      let insertedThisSource = 0;
      let skippedExisting = 0;
      let skippedLocation = 0;
      let skippedGates = 0;
      for (const job of jobs) {
        if (existing.has(job.external_id)) {
          skippedExisting++;
          continue;
        }
        const title = job.title ?? null;
        const location = job.location ?? "";
        const description = job.description ?? null;
        if (!locationEligible(location, settings.allowed_locations, settings.allow_remote)) {
          skippedLocation++;
          continue;
        }
        if (!passesTitleAndDescriptionGates(title, description, settings.allow_gpm, settings.allow_junior_pm)) {
          skippedGates++;
          continue;
        }
        const final_fit_score = computeFinalFitScore(title, description);
        const resume_match = profileMatchScore(title, description);
        const bucket = computeBucket(resume_match, final_fit_score);
        const suggestions_json =
          bucket === "NEAR_MATCH" && (description ?? "").trim()
            ? JSON.stringify(generateSuggestionsForNearMatch(title, description))
            : null;
        // tier/cpi are legacy back-compat; canonical is bucket (APPLY_NOW / STRONG_FIT / NEAR_MATCH / REVIEW / HIDE).
        const cpi = final_fit_score >= 0 ? Math.round(final_fit_score / 10) : null;
        const tier = cpi != null ? (cpi >= 9 ? "Top 5%" : cpi >= 7 ? "Top 20%" : "Reject") : null;
        insertJob.run(
          source.id,
          job.external_id,
          job.title ?? "",
          job.location ?? "",
          job.url ?? "",
          description,
          cpi,
          tier,
          job.posted_at ?? null,
          final_fit_score,
          resume_match,
          bucket,
          suggestions_json,
          job.company ?? null,
        );
        existing.add(job.external_id);
        insertedThisSource++;
        totalInserted++;
        inserted.push({
          title: job.title ?? "",
          company: job.company ?? source.company,
          location: job.location ?? "",
          url: job.url ?? "",
          final_fit_score,
          resume_match,
          bucket,
        });
      }
      const newCandidates = jobs.length - skippedExisting;
      console.log(
        `${source.company}: ${jobs.length} fetched, ${skippedExisting} already in DB, ` +
        `${newCandidates} candidates → ${skippedLocation} failed location, ${skippedGates} failed gates → ${insertedThisSource} new`
      );
      updateLastPolled.run(source.id);
    } catch (err) {
      console.error(`${source.company} (${source.parser}):`, err);
    }
  }

  console.log(`Done. Total new jobs inserted: ${totalInserted}`);
  return { count: totalInserted, inserted };
}

async function main() {
  const forceAll = process.argv.includes("--force");
  const { count } = await runPoll(forceAll);
  console.log(`Total: ${count} new jobs.`);
  process.exit(0);
}

// Only run main when this file is executed directly (e.g. npm run poll), not when imported by agent
const isPollRunDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("poll.ts") || process.argv[1].includes("scripts/poll"));
if (isPollRunDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
