import path from "path";
import Database from "better-sqlite3";

const rawPath = process.env.DATABASE_PATH ?? "roleradar.db";
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
export const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS job_sources (
  id INTEGER PRIMARY KEY,
  company TEXT NOT NULL,
  url TEXT NOT NULL,
  parser TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  company_tier INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  source_id INTEGER,
  external_id TEXT,
  title TEXT,
  location TEXT,
  url TEXT,
  description TEXT,
  cpi INTEGER,
  tier TEXT,
  created_at TEXT,
  posted_at TEXT,
  description_hash TEXT,
  team_context_json TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  linkedin_url TEXT,
  relationship_type TEXT,
  connection_status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS job_people (
  job_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  message_type TEXT NOT NULL,
  drafted_message TEXT NOT NULL,
  outreach_status TEXT DEFAULT 'queued',
  PRIMARY KEY (job_id, person_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS job_referral_targets (
  job_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  search_query TEXT,
  search_url TEXT NOT NULL,
  why_selected TEXT NOT NULL,
  confidence INTEGER,
  archetype TEXT,
  source TEXT,
  outreach_status TEXT DEFAULT 'queued',
  drafted_message TEXT NOT NULL,
  PRIMARY KEY (job_id, slot),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
`);
migrateReferralTargetsV2();
migrateJobsPostedAt();
migrateJobSourcesTier();
migrateJobsV2Scoring();

function migrateReferralTargetsV2(): void {
  const cols = db.prepare("PRAGMA table_info(job_referral_targets)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("search_query")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN search_query TEXT");
  if (!names.has("confidence")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN confidence INTEGER");
  if (!names.has("archetype")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN archetype TEXT");
  if (!names.has("source")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN source TEXT");
  if (!names.has("person_name")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN person_name TEXT");
  if (!names.has("title_guess")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN title_guess TEXT");
  if (!names.has("linkedin_url")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN linkedin_url TEXT");
  if (!names.has("priority")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN priority INTEGER");
  if (!names.has("created_at")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  if (!names.has("refreshed_at")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN refreshed_at TEXT");
}

function migrateJobsPostedAt(): void {
  const cols = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "posted_at")) db.exec("ALTER TABLE jobs ADD COLUMN posted_at TEXT");
  if (!cols.some((c) => c.name === "description_hash")) db.exec("ALTER TABLE jobs ADD COLUMN description_hash TEXT");
  if (!cols.some((c) => c.name === "team_context_json")) db.exec("ALTER TABLE jobs ADD COLUMN team_context_json TEXT");
}

function migrateJobSourcesTier(): void {
  const cols = db.prepare("PRAGMA table_info(job_sources)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "company_tier")) db.exec("ALTER TABLE job_sources ADD COLUMN company_tier INTEGER");
  if (!cols.some((c) => c.name === "last_polled_at")) db.exec("ALTER TABLE job_sources ADD COLUMN last_polled_at TEXT");
}

function migrateJobsV2Scoring(): void {
  const cols = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "first_seen_at")) db.exec("ALTER TABLE jobs ADD COLUMN first_seen_at TEXT");
  if (!cols.some((c) => c.name === "last_seen_at")) db.exec("ALTER TABLE jobs ADD COLUMN last_seen_at TEXT");
  if (!cols.some((c) => c.name === "final_fit_score")) db.exec("ALTER TABLE jobs ADD COLUMN final_fit_score INTEGER");
  if (!cols.some((c) => c.name === "resume_match")) db.exec("ALTER TABLE jobs ADD COLUMN resume_match INTEGER");
  if (!cols.some((c) => c.name === "bucket")) db.exec("ALTER TABLE jobs ADD COLUMN bucket TEXT");
  if (!cols.some((c) => c.name === "suggestions_json")) db.exec("ALTER TABLE jobs ADD COLUMN suggestions_json TEXT");
  // Backfill first_seen_at / last_seen_at from created_at for existing rows
  db.exec(
    "UPDATE jobs SET first_seen_at = COALESCE(first_seen_at, created_at), last_seen_at = COALESCE(last_seen_at, created_at) WHERE first_seen_at IS NULL OR last_seen_at IS NULL"
  );
}
