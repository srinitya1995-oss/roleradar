import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH ?? "roleradar.db";
export const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS job_sources (
  id INTEGER PRIMARY KEY,
  company TEXT NOT NULL,
  url TEXT NOT NULL,
  parser TEXT NOT NULL,
  enabled INTEGER DEFAULT 1
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
  posted_at TEXT
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

function migrateReferralTargetsV2(): void {
  const cols = db.prepare("PRAGMA table_info(job_referral_targets)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("search_query")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN search_query TEXT");
  if (!names.has("confidence")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN confidence INTEGER");
  if (!names.has("archetype")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN archetype TEXT");
  if (!names.has("source")) db.exec("ALTER TABLE job_referral_targets ADD COLUMN source TEXT");
}

function migrateJobsPostedAt(): void {
  const cols = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "posted_at")) db.exec("ALTER TABLE jobs ADD COLUMN posted_at TEXT");
}
