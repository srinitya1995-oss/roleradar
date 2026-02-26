/**
 * One command to ensure job sources exist and fetch new jobs.
 * Run: npm run setup
 * Prints: sources count, new jobs this run, total jobs in DB.
 * If 0 new jobs: suggests ALLOW_REMOTE=true (many boards list "Remote" only).
 */
import { db } from "../src/lib/db";
import { getCompanyTier } from "../src/lib/source-tiers";
import { runPoll } from "./poll";

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

function seedSources(): number {
  let added = 0;
  for (const { company, url, parser } of SOURCES) {
    const tier = getCompanyTier(company);
    const row = exists.get(company) as { id: number } | undefined;
    if (row) {
      update.run(url, parser, tier, company);
    } else {
      insert.run(company, url, parser, tier);
      added++;
    }
  }
  const allSources = db.prepare("SELECT id, company FROM job_sources").all() as { id: number; company: string }[];
  const updateTier = db.prepare("UPDATE job_sources SET company_tier = ? WHERE id = ?");
  for (const s of allSources) {
    updateTier.run(getCompanyTier(s.company), s.id);
  }
  return added;
}

async function main() {
  console.log("Role Radar — setup & poll\n");

  const added = seedSources();
  const sourceCount = (db.prepare("SELECT COUNT(*) as c FROM job_sources WHERE enabled = 1").get() as { c: number }).c;
  console.log(`Sources: ${sourceCount} enabled. ${added > 0 ? `Added ${added} new.` : "Already seeded."}\n`);

  console.log("Polling job boards…");
  const { count: newJobs, inserted } = await runPoll();
  const totalJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;

  console.log("\n--- Result ---");
  console.log(`New jobs this run: ${newJobs}`);
  console.log(`Total jobs in DB:  ${totalJobs}`);

  if (newJobs === 0 && totalJobs < 50) {
    console.log("\nIf you expected more jobs: many postings are \"Remote\" only.");
    console.log("Set ALLOW_REMOTE=true in .env and run again: npm run poll");
  }

  console.log("\nTo keep fetching every 30 min: npm run agent (leave running in a terminal).");
  console.log("To open the app: npm run dev, then http://localhost:3000/inbox");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
