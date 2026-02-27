/**
 * Debug: fetch one source and print job titles + which gate they fail (0, 1, 2, or 4).
 * Run: npx tsx scripts/poll-debug-gates.ts [source_company]
 * Example: npx tsx scripts/poll-debug-gates.ts Anthropic
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { db } from "../src/lib/db";
import { parseGreenhouseBoard } from "../src/lib/parsers/greenhouse";
import { parseAshbyBoard } from "../src/lib/parsers/ashby";
import { parseWorkdayBoard } from "../src/lib/parsers/workday";
import { parseLinkedInJobs } from "../src/lib/parsers/linkedin";
import { parseAdzunaJobs } from "../src/lib/parsers/adzuna";
import { parseJSearchJobs } from "../src/lib/parsers/jsearch";
import { passesGate0, passesGate1, passesGate2, passesGate4 } from "../src/lib/gates";
import { getSettings } from "../src/lib/settings";
import { locationEligible } from "../src/lib/location";

const parsers: Record<string, (url: string) => Promise<{ title: string; location: string; description?: string | null; external_id?: string }[]>> = {
  greenhouse: parseGreenhouseBoard,
  ashby: parseAshbyBoard,
  workday: parseWorkdayBoard,
  linkedin: parseLinkedInJobs,
  adzuna: parseAdzunaJobs,
  jsearch: parseJSearchJobs,
};

type JobSource = { id: number; company: string; url: string; parser: string };
const sources = db.prepare("SELECT id, company, url, parser FROM job_sources WHERE enabled = 1").all() as JobSource[];

async function main() {
  const want = (process.argv[2] ?? "Anthropic").trim();
  const source = sources.find((s) => s.company.toLowerCase().includes(want.toLowerCase()));
  if (!source) {
    console.log("Usage: npx tsx scripts/poll-debug-gates.ts [CompanyName]");
    console.log("Sources:", sources.map((s) => s.company).join(", "));
    process.exit(1);
  }

  const run = parsers[source.parser];
  if (!run) {
    console.log("No parser for", source.parser);
    process.exit(1);
  }

  const settings = getSettings();
  const jobs = await run(source.url);
  console.log(`\n${source.company}: ${jobs.length} jobs (showing first 25)\n`);

  type JobWithId = { title: string; location: string; description?: string | null; external_id?: string };
  const existing = new Set(
    (db.prepare("SELECT external_id FROM jobs WHERE source_id = ?").all(source.id) as { external_id: string }[]).map(
      (r) => r.external_id
    )
  );

  let shown = 0;
  for (const job of jobs as JobWithId[]) {
    if (existing.has(job.external_id ?? "")) continue;
    const title = job.title ?? null;
    const location = (job as { location?: string }).location ?? "";
    const description = job.description ?? null;

    const locOk = locationEligible(location, settings.allowed_locations, settings.allow_remote);
    const g0 = passesGate0(title);
    const g1 = passesGate1(title, settings.allow_gpm);
    const g2 = passesGate2(title);
    const g4 = passesGate4(title, description);

    const why: string[] = [];
    if (!locOk) why.push("location");
    if (!g0) why.push("G0");
    if (!g1) why.push("G1");
    if (!g2) why.push("G2");
    if (!g4) why.push("G4");

    const pass = locOk && g0 && g1 && g2 && g4;
    console.log(pass ? "✓" : "✗", (title || "").slice(0, 60).padEnd(62), why.length ? why.join(",") : "pass");
    if (++shown >= 25) break;
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
