/**
 * Add top-company job sources that we have parsers for.
 * V2: sets company_tier (1=30min, 2=2hr, 3=daily) from docs/JOB_SOURCE_FETCHING_V2_SPEC.md.
 * Run: npx tsx scripts/seed-top-companies.ts
 */
import { db } from "../src/lib/db";
import { getCompanyTier } from "../src/lib/source-tiers";

const SOURCES: { company: string; url: string; parser: string }[] = [
  { company: "Anthropic", url: "https://boards.greenhouse.io/anthropic", parser: "greenhouse" },
  { company: "Adobe", url: "https://adobe.wd5.myworkdayjobs.com/external_experienced", parser: "workday" },
  { company: "Airbnb", url: "https://boards.greenhouse.io/airbnb", parser: "greenhouse" },
  { company: "Uber", url: "https://boards.greenhouse.io/uberfreight", parser: "greenhouse" },
  { company: "OpenAI", url: "https://jobs.ashbyhq.com/openai", parser: "ashby" },
];

const insert = db.prepare(
  "INSERT INTO job_sources (company, url, parser, enabled, company_tier) VALUES (?, ?, ?, 1, ?)"
);
const update = db.prepare(
  "UPDATE job_sources SET url = ?, parser = ?, enabled = 1, company_tier = ? WHERE company = ?"
);
const exists = db.prepare("SELECT id FROM job_sources WHERE company = ?");

for (const { company, url, parser } of SOURCES) {
  const tier = getCompanyTier(company);
  const row = exists.get(company) as { id: number } | undefined;
  if (row) {
    update.run(url, parser, tier, company);
    console.log(`Updated: ${company} (${parser}, tier ${tier}).`);
  } else {
    insert.run(company, url, parser, tier);
    console.log(`Added: ${company} (${parser}, tier ${tier}).`);
  }
}

// Backfill company_tier for any existing sources
const allSources = db.prepare("SELECT id, company FROM job_sources").all() as { id: number; company: string }[];
const updateTier = db.prepare("UPDATE job_sources SET company_tier = ? WHERE id = ?");
for (const s of allSources) {
  updateTier.run(getCompanyTier(s.company), s.id);
}

console.log("Done. Run npm run poll to fetch jobs.");
process.exit(0);
