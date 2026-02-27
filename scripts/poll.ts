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
import { passesTitleAndDescriptionGates, passesTitleAndDescriptionGatesSkipGate4 } from "../src/lib/gates";
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
  INSERT INTO jobs (source_id, external_id, title, location, url, description, cpi, tier, created_at, posted_at, first_seen_at, last_seen_at, final_fit_score, resume_match, bucket, suggestions_json, company, needs_hydration)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)
`);

/** Parsers that typically return no description in the list API; we insert with needs_hydration=1 and skip GATE 4. */
const NO_DESCRIPTION_PARSERS = new Set(["greenhouse", "workday"]);

function getExistingExternalIds(sourceId: number): Set<string> {
  const rows = db.prepare("SELECT external_id FROM jobs WHERE source_id = ?").all(sourceId) as { external_id: string }[];
  return new Set(rows.map((r) => r.external_id ?? ""));
}

function getExistingJobRow(sourceId: number, externalId: string): { id: number; title: string | null; description: string | null } | null {
  const row = db.prepare("SELECT id, title, description FROM jobs WHERE source_id = ? AND external_id = ?").get(sourceId, externalId) as
    | { id: number; title: string | null; description: string | null }
    | undefined;
  return row ?? null;
}

const updateJobScores = db.prepare(
  "UPDATE jobs SET final_fit_score = ?, resume_match = ?, bucket = ?, suggestions_json = ?, needs_hydration = 0 WHERE id = ?"
);

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

/** Run one poll cycle; exported for use by agent. forceRescore: re-run score/bucket for existing jobs (by source_id + external_id). */
export async function runPoll(forceAll = false, forceRescore = false): Promise<{ count: number; inserted: InsertedJob[]; rescored: number }> {
  const allSources = db.prepare(
    "SELECT id, company, url, parser, company_tier, last_polled_at FROM job_sources WHERE enabled = 1"
  ).all() as JobSource[];
  const sources = forceAll ? allSources : allSources.filter(sourceDue);
  if (forceAll && allSources.length) console.log(`Force poll: running all ${allSources.length} enabled sources.`);
  if (forceRescore) console.log("Force rescore: re-running score and bucket for existing jobs.");
  if (!sources.length) {
    console.log("No sources due to poll (run with --force to poll all enabled sources).");
  }
  let totalInserted = 0;
  let totalRescored = 0;
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
      let rescoredThisSource = 0;
      let skippedExisting = 0;
      let skippedLocation = 0;
      let skippedGates = 0;
      for (const job of jobs) {
        const company = (job.company ?? source.company ?? "").trim().toLowerCase();
        if (company === "indeed") continue;

        const title = job.title ?? null;
        const location = job.location ?? "";
        const description = job.description ?? null;
        const hasDescription = (description ?? "").trim().length > 0;
        const useSkipGate4 = NO_DESCRIPTION_PARSERS.has(source.parser) && !hasDescription;

        if (existing.has(job.external_id)) {
          if (forceRescore) {
            const row = getExistingJobRow(source.id, job.external_id);
            if (row) {
              const desc = row.description ?? description ?? null;
              const t = row.title ?? title;
              const final_fit_score = computeFinalFitScore(t, desc);
              const resume_match = profileMatchScore(t, desc);
              const bucket = computeBucket(resume_match, final_fit_score);
              const suggestions_json =
                bucket === "NEAR_MATCH" && (desc ?? "").trim()
                  ? JSON.stringify(generateSuggestionsForNearMatch(t, desc))
                  : null;
              updateJobScores.run(final_fit_score, resume_match, bucket, suggestions_json, row.id);
              rescoredThisSource++;
              totalRescored++;
            }
          }
          skippedExisting++;
          continue;
        }
        if (!locationEligible(location, settings.allowed_locations, settings.allow_remote)) {
          skippedLocation++;
          continue;
        }
        const gatesPass =
          useSkipGate4
            ? passesTitleAndDescriptionGatesSkipGate4(title, description, settings.allow_gpm, settings.allow_junior_pm)
            : passesTitleAndDescriptionGates(title, description, settings.allow_gpm, settings.allow_junior_pm);
        if (!gatesPass) {
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
        const needs_hydration = useSkipGate4 ? 1 : 0;
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
          needs_hydration,
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
        `${source.company}: ${jobs.length} fetched, ${skippedExisting} already in DB` +
        (forceRescore && rescoredThisSource ? `, ${rescoredThisSource} rescored` : "") +
        `, ${newCandidates} candidates → ${skippedLocation} failed location, ${skippedGates} failed gates → ${insertedThisSource} new`
      );
      updateLastPolled.run(source.id);
    } catch (err) {
      console.error(`${source.company} (${source.parser}):`, err);
    }
  }

  console.log(`Done. Total new jobs inserted: ${totalInserted}${forceRescore ? `, rescored: ${totalRescored}` : ""}.`);
  return { count: totalInserted, inserted, rescored: totalRescored };
}

async function main() {
  const forceAll = process.argv.includes("--force");
  const forceRescore = process.argv.includes("--force-rescore");
  const { count, rescored } = await runPoll(forceAll, forceRescore);
  console.log(`Total: ${count} new jobs${forceRescore && rescored ? `, ${rescored} rescored` : ""}.`);
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
