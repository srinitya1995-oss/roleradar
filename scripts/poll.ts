/**
 * Poll enabled job_sources, run parser, insert new jobs. Dedup by external_id per source.
 * GATE 0–4 run first; only eligible PM roles get CPI computed and stored.
 * GATE 3: location must match allowed_locations (CA + Seattle variants; Remote removed).
 */
import { db } from "../src/lib/db";
import { parseGreenhouseBoard } from "../src/lib/parsers/greenhouse";
import { parseLeverBoard } from "../src/lib/parsers/lever";
import { parseAshbyBoard } from "../src/lib/parsers/ashby";
import { parseSmartRecruitersBoard } from "../src/lib/parsers/smartrecruiters";
import { parseWorkdayBoard } from "../src/lib/parsers/workday";
import { scoreCpi, cpiTier } from "../src/lib/cpi";
import { passesTitleAndDescriptionGates } from "../src/lib/gates";
import { getSettings, locationMatchesAllowed } from "../src/lib/settings";

type JobSource = { id: number; company: string; url: string; parser: string };
type ParsedJob = { title: string; url: string; location: string; external_id: string; description?: string; posted_at?: string | null };

const parsers: Record<string, (url: string) => Promise<ParsedJob[]>> = {
  greenhouse: parseGreenhouseBoard,
  lever: parseLeverBoard,
  ashby: parseAshbyBoard,
  smartrecruiters: parseSmartRecruitersBoard,
  workday: parseWorkdayBoard,
};

const insertJob = db.prepare(`
  INSERT INTO jobs (source_id, external_id, title, location, url, description, cpi, tier, created_at, posted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
`);

function getExistingExternalIds(sourceId: number): Set<string> {
  const rows = db.prepare("SELECT external_id FROM jobs WHERE source_id = ?").all(sourceId) as { external_id: string }[];
  return new Set(rows.map((r) => r.external_id ?? ""));
}

/** Run one poll cycle; exported for use by agent. */
export async function runPoll(): Promise<number> {
  const sources = db.prepare("SELECT id, company, url, parser FROM job_sources WHERE enabled = 1").all() as JobSource[];
  let totalInserted = 0;

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
      let inserted = 0;
      for (const job of jobs) {
        if (existing.has(job.external_id)) continue;
        const title = job.title ?? null;
        const location = job.location ?? "";
        const description = job.description ?? null;
        if (!locationMatchesAllowed(location, settings.allowed_locations)) continue;
        if (!passesTitleAndDescriptionGates(title, description)) continue;
        const cpi = scoreCpi(title, description);
        const tier = cpi != null ? cpiTier(cpi) : null;
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
        );
        existing.add(job.external_id);
        inserted++;
        totalInserted++;
      }
      console.log(`${source.company}: ${jobs.length} jobs, ${inserted} new (after gates + location)`);
    } catch (err) {
      console.error(`${source.company} (${source.parser}):`, err);
    }
  }

  console.log(`Done. Total new jobs inserted: ${totalInserted}`);
  return totalInserted;
}

async function main() {
  await runPoll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
