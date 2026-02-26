/**
 * One-off backfill: set final_fit_score, resume_match, bucket for existing job rows.
 * Safe: missing/empty description → bucket=HIDE, scores=0 unless title strongly passes PM gates → REVIEW.
 * Run: npm run backfill:jobs   or   npx tsx scripts/backfill-jobs.ts
 * Option: BACKFILL_DAYS=60 to limit to last 60 days (default: all rows).
 */
import { db } from "../src/lib/db";
import { computeFinalFitScore } from "../src/lib/scoring";
import { profileMatchScore } from "../src/lib/profile";
import { computeBucket } from "../src/lib/buckets";
import { passesGate1, passesGate2 } from "../src/lib/gates";
import { generateSuggestionsForNearMatch } from "../src/lib/suggestions";

const BATCH_SIZE = 200;
const DEFAULT_DAYS = 99999;

type Row = {
  id: number;
  title: string | null;
  description: string | null;
  location: string | null;
  company: string | null;
};

function main() {
  const days = Math.max(1, parseInt(process.env.BACKFILL_DAYS ?? String(DEFAULT_DAYS), 10) || DEFAULT_DAYS);
  const limitClause = days >= 99999 ? "" : `AND (j.posted_at >= datetime('now', '-${days} days') OR j.posted_at IS NULL AND COALESCE(j.first_seen_at, j.created_at) >= datetime('now', '-${days} days'))`;

  const rows = db.prepare(`
    SELECT j.id, j.title, j.description, j.location, s.company
    FROM jobs j
    LEFT JOIN job_sources s ON j.source_id = s.id
    WHERE 1=1 ${limitClause}
    ORDER BY j.id
  `).all() as Row[];

  console.log(`Backfilling ${rows.length} jobs (BACKFILL_DAYS=${days === 99999 ? "all" : days})…`);

  const updateStmt = db.prepare(
    "UPDATE jobs SET final_fit_score = ?, resume_match = ?, bucket = ?, suggestions_json = ? WHERE id = ?"
  );

  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const transaction = db.transaction(() => {
      for (const r of batch) {
        const title = r.title ?? null;
        const desc = (r.description ?? "").trim();
        let final_fit_score: number;
        let resume_match: number;
        let bucket: string;

        let suggestions_json: string | null = null;
        if (!desc) {
          final_fit_score = 0;
          resume_match = 0;
          bucket = passesGate1(title, false) && passesGate2(title) ? "REVIEW" : "HIDE";
        } else {
          final_fit_score = computeFinalFitScore(title, r.description);
          resume_match = profileMatchScore(title, r.description);
          bucket = computeBucket(resume_match, final_fit_score);
          if (bucket === "NEAR_MATCH") {
            suggestions_json = JSON.stringify(generateSuggestionsForNearMatch(title, r.description));
          }
        }

        updateStmt.run(final_fit_score, resume_match, bucket, suggestions_json, r.id);
        updated++;
      }
    });
    transaction();
    console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }

  console.log(`Done. Updated ${updated} jobs.`);
  process.exit(0);
}

main();
