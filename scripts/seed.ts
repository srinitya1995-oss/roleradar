/**
 * One-time seed: add Anthropic Greenhouse as first job source.
 * Run: npx tsx scripts/seed.ts
 */
import { db } from "../src/lib/db";

const existing = db.prepare("SELECT 1 FROM job_sources LIMIT 1").get();
if (existing) {
  console.log("job_sources already has data, skip seed.");
  process.exit(0);
}

db.prepare(
  "INSERT INTO job_sources (company, url, parser, enabled) VALUES (?, ?, ?, 1)"
).run("Anthropic", "https://boards.greenhouse.io/anthropic", "greenhouse");
console.log("Seeded: Anthropic (Greenhouse). Run npm run poll to fetch jobs.");
process.exit(0);
