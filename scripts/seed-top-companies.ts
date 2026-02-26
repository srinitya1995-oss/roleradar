/**
 * Add top-company job sources that we have parsers for.
 * Supported: Anthropic (greenhouse), Adobe (workday), Airbnb (greenhouse), Uber (greenhouse), OpenAI (ashby).
 * Run: npx tsx scripts/seed-top-companies.ts
 */
import { db } from "../src/lib/db";

const SOURCES: { company: string; url: string; parser: string }[] = [
  { company: "Anthropic", url: "https://boards.greenhouse.io/anthropic", parser: "greenhouse" },
  { company: "Adobe", url: "https://adobe.wd5.myworkdayjobs.com/external_experienced", parser: "workday" },
  { company: "Airbnb", url: "https://boards.greenhouse.io/airbnb", parser: "greenhouse" },
  { company: "Uber", url: "https://boards.greenhouse.io/uberfreight", parser: "greenhouse" },
  { company: "OpenAI", url: "https://jobs.ashbyhq.com/openai", parser: "ashby" },
];

const insert = db.prepare(
  "INSERT INTO job_sources (company, url, parser, enabled) VALUES (?, ?, ?, 1)"
);
const update = db.prepare(
  "UPDATE job_sources SET url = ?, parser = ?, enabled = 1 WHERE company = ?"
);
const exists = db.prepare("SELECT id FROM job_sources WHERE company = ?");

for (const { company, url, parser } of SOURCES) {
  const row = exists.get(company) as { id: number } | undefined;
  if (row) {
    update.run(url, parser, company);
    console.log(`Updated: ${company} (${parser}).`);
  } else {
    insert.run(company, url, parser);
    console.log(`Added: ${company} (${parser}).`);
  }
}

console.log("Done. Run npm run poll to fetch jobs.");
process.exit(0);
