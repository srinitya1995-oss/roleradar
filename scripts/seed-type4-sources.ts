/**
 * Add Type 4 (Big Tech) companies as job sources using SerpApi Google Jobs.
 * Each source uses parser=linkedin with the seed query as url so the agent actually pulls jobs for Apple, Google, Microsoft, etc.
 * Requires: SERPAPI_API_KEY in .env
 * Run: npx tsx scripts/seed-type4-sources.ts
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { db } from "../src/lib/db";
import { getCompanyTier } from "../src/lib/source-tiers";
import { TYPE_4_SOURCES } from "../src/lib/type4-discovery-config";

const insert = db.prepare(
  "INSERT INTO job_sources (company, url, parser, enabled, company_tier) VALUES (?, ?, ?, 1, ?)"
);
const update = db.prepare(
  "UPDATE job_sources SET url = ?, parser = ?, enabled = 1, company_tier = ? WHERE company = ?"
);
const exists = db.prepare("SELECT id FROM job_sources WHERE company = ?");

function main() {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    console.warn("SERPAPI_API_KEY not set. Type 4 sources use SerpApi (Google Jobs); set the key and run again.");
  }

  let added = 0;
  let updated = 0;
  for (const source of TYPE_4_SOURCES) {
    const tier = getCompanyTier(source.company);
    const row = exists.get(source.company) as { id: number } | undefined;
    if (row) {
      update.run(source.seedQuery, "linkedin", tier, source.company);
      updated++;
      console.log(`Updated: ${source.company} (linkedin, query: "${source.seedQuery.slice(0, 40)}...", tier ${tier})`);
    } else {
      insert.run(source.company, source.seedQuery, "linkedin", tier);
      added++;
      console.log(`Added: ${source.company} (linkedin, query: "${source.seedQuery.slice(0, 40)}...", tier ${tier})`);
    }
  }

  console.log(`\nDone. ${added} added, ${updated} updated. Run: npm run poll -- --force`);
  process.exit(0);
}

main();
