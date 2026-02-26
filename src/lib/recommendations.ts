/**
 * Outreach recommendation logic for CPI >= 7 jobs.
 * Prioritize: same company, Ex-Amazon, Adjacent org. Up to 3 people.
 * No LinkedIn scraping; uses people pool only.
 * For LLM/search-based target finding, use REFERRAL_TARGET_FINDER_SYSTEM_PROMPT from ./prompts.
 */

import { db } from "./db";
import { connectNote, referralAsk } from "./messages";
import { candidateProfile } from "./profile";

const RELATIONSHIP_ORDER = ["Ex-Amazon", "Same team", "Adjacent org", "Other"];
const OUTREACH_STATUSES = ["queued", "sent", "responded"] as const;

export type PersonRow = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  relationship_type: string | null;
  connection_status: string | null;
  notes: string | null;
};

export type JobPersonRow = {
  job_id: number;
  person_id: number;
  message_type: string;
  drafted_message: string;
  outreach_status: string;
};

export type OutreachTarget = {
  person: PersonRow;
  job_person: JobPersonRow;
};

function relationshipRank(relationshipType: string | null): number {
  if (!relationshipType) return RELATIONSHIP_ORDER.length;
  const i = RELATIONSHIP_ORDER.indexOf(relationshipType);
  return i === -1 ? RELATIONSHIP_ORDER.length : i;
}

export function getRecommendationsForJob(jobId: number): OutreachTarget[] {
  const job = db.prepare(`
    SELECT j.id, j.external_id, s.company AS company_name
    FROM jobs j
    LEFT JOIN job_sources s ON j.source_id = s.id
    WHERE j.id = ?
  `).get(jobId) as { id: number; external_id: string | null; company_name: string | null } | undefined;

  if (!job) return [];

  const jobIdStr = job.external_id ?? String(jobId);
  const companyName = (job.company_name ?? "").trim().toLowerCase();

  const people = db.prepare("SELECT id, name, title, company, linkedin_url, relationship_type, connection_status, notes FROM people").all() as PersonRow[];

  const textForProfileMatch = (p: PersonRow) =>
    [p.title, p.company, p.notes].filter(Boolean).join(" ").toLowerCase();
  const profileAlignment = (p: PersonRow) => {
    const text = textForProfileMatch(p);
    return candidateProfile.backgroundKeywords.filter((kw) => text.includes(kw.toLowerCase())).length;
  };

  const scored = people.map((p) => {
    const companyMatch = companyName && (p.company ?? "").trim().toLowerCase() === companyName ? 1 : 0;
    const relRank = relationshipRank(p.relationship_type ?? null);
    const profileScore = profileAlignment(p);
    return { person: p, companyMatch, profileScore, relRank };
  });

  scored.sort((a, b) => {
    if (b.companyMatch !== a.companyMatch) return b.companyMatch - a.companyMatch;
    if (b.profileScore !== a.profileScore) return b.profileScore - a.profileScore;
    return a.relRank - b.relRank;
  });

  const top3 = scored.slice(0, 3).map(({ person }) => person);
  const insertStmt = db.prepare(`
    INSERT INTO job_people (job_id, person_id, message_type, drafted_message, outreach_status)
    VALUES (?, ?, ?, ?, 'queued')
    ON CONFLICT(job_id, person_id) DO UPDATE SET
      message_type = excluded.message_type,
      drafted_message = excluded.drafted_message
  `);

  const result: OutreachTarget[] = [];

  for (const person of top3) {
    const isConnected = (person.connection_status ?? "").toLowerCase() === "connected";
    const messageType = isConnected ? "referral_ask" : "connect_note";
    const draftedMessage = isConnected
      ? referralAsk(person.name, jobIdStr)
      : connectNote(person.name, jobIdStr);

    insertStmt.run(jobId, person.id, messageType, draftedMessage);

    const jp = db.prepare("SELECT job_id, person_id, message_type, drafted_message, outreach_status FROM job_people WHERE job_id = ? AND person_id = ?")
      .get(jobId, person.id) as JobPersonRow;
    result.push({ person, job_person: jp });
  }

  return result;
}

export function getExistingRecommendations(jobId: number): OutreachTarget[] {
  const rows = db.prepare(`
    SELECT jp.job_id, jp.person_id, jp.message_type, jp.drafted_message, jp.outreach_status
    FROM job_people jp
    WHERE jp.job_id = ?
    ORDER BY jp.person_id
  `).all(jobId) as JobPersonRow[];

  if (rows.length === 0) return [];

  const people = db.prepare("SELECT id, name, title, company, linkedin_url, relationship_type, connection_status, notes FROM people WHERE id IN (?" + ",?".repeat(rows.length - 1) + ")")
    .all(...rows.map((r) => r.person_id)) as PersonRow[];

  const personMap = new Map(people.map((p) => [p.id, p]));
  return rows.map((job_person) => {
    const person = personMap.get(job_person.person_id);
    if (!person) return null;
    return { person, job_person };
  }).filter((x): x is OutreachTarget => x != null);
}

export function updateOutreachStatus(jobId: number, personId: number, outreachStatus: string): void {
  if (!OUTREACH_STATUSES.includes(outreachStatus as (typeof OUTREACH_STATUSES)[number])) return;
  db.prepare("UPDATE job_people SET outreach_status = ? WHERE job_id = ? AND person_id = ?")
    .run(outreachStatus, jobId, personId);
}
