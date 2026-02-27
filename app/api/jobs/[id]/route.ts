import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { connectNote } from "@/src/lib/messages";
import { getSettings } from "@/src/lib/settings";
import {
  getRecommendationsForJob,
  getExistingRecommendations,
  updateOutreachStatus,
} from "@/src/lib/recommendations";
import {
  needConnectionsV2,
  getOrCreateReferralTargetsForJob,
  getReferralTargetsForJob,
  saveReferralTargets,
  updateReferralTargetStatus,
  mergeReferralTargetsLlmWithHeuristic,
} from "@/src/lib/referral-targets";
import { getReferralTargetsFromLLMV2 } from "@/src/lib/referral-llm";

type JobRow = {
  id: number;
  title: string | null;
  location: string | null;
  url: string | null;
  external_id: string | null;
  cpi: number | null;
  tier: string | null;
  source_id: number | null;
  created_at?: string | null;
  posted_at?: string | null;
  first_seen_at?: string | null;
  company: string | null;
  bucket: string | null;
  final_fit_score: number | null;
  resume_match: number | null;
  suggestions_json: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const job = db.prepare(
    `SELECT j.id, j.title, j.location, j.url, j.external_id, j.cpi, j.tier, j.source_id, j.created_at, j.posted_at, j.first_seen_at, j.bucket, j.final_fit_score, j.resume_match, j.suggestions_json, s.company
     FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?`
  ).get(id) as JobRow | undefined;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const settings = getSettings();
  const finalFitScore = job.final_fit_score ?? (job.cpi != null ? job.cpi * 10 : 0);
  const eligible = needConnectionsV2(job.bucket ?? null, finalFitScore);

  const url = new URL(request.url);
  const refreshTargets = url.searchParams.get("refresh_targets") === "1";

  if (refreshTargets) {
    db.prepare("DELETE FROM job_referral_targets WHERE job_id = ?").run(id);
  }

  const loadTargetsFromDb = () => {
    const targetRowsWithCreated = db
      .prepare("SELECT job_id, slot, target_type, search_url, why_selected, confidence, archetype, source, outreach_status, drafted_message, created_at FROM job_referral_targets WHERE job_id = ? ORDER BY slot")
      .all(id) as Array<{ created_at: string | null } & Record<string, unknown>>;
    return targetRowsWithCreated.map((t) => ({
      slot: t.slot as number,
      target_type: t.target_type as string,
      search_url: t.search_url as string,
      why_selected: t.why_selected as string,
      confidence: (t.confidence as number | null) ?? null,
      archetype: (t.archetype as string | null) ?? null,
      source: (t.source as string | null) ?? null,
      outreach_status: t.outreach_status as string,
      drafted_message: t.drafted_message as string,
      created_at: t.created_at ?? null,
    }));
  };

  let referral_targets = loadTargetsFromDb();

  const shouldEnsureTargets = eligible || refreshTargets;
  if (shouldEnsureTargets && referral_targets.length === 0) {
    const useLLM = Boolean(process.env.OPENAI_API_KEY);
    if (useLLM) {
      try {
        const jobDetail = db
          .prepare(
            "SELECT j.title, j.description, j.location, j.external_id, s.company FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?"
          )
          .get(id) as { title: string | null; description: string | null; location: string | null; external_id: string | null; company: string | null } | undefined;
        if (jobDetail) {
          const company = (jobDetail.company ?? "").trim() || "Company";
          const payload = await getReferralTargetsFromLLMV2({
            title: jobDetail.title,
            company,
            job_id: String(id),
            description: jobDetail.description,
            location: jobDetail.location,
          });
          if (payload?.targets?.length) {
            const merged = mergeReferralTargetsLlmWithHeuristic(id, payload.targets, company);
            if (merged.length > 0) saveReferralTargets(id, merged);
          }
        }
      } catch {
        // fall through to heuristic
      }
    }
    if (referral_targets.length === 0) {
      getOrCreateReferralTargetsForJob(id);
    }
    referral_targets = loadTargetsFromDb();
  }

  const oldestTargetCreated = referral_targets.length > 0
    ? referral_targets.reduce((min, t) => (!t.created_at ? min : (!min || t.created_at < min ? t.created_at : min)), null as string | null)
    : null;
  const staleCutoff = new Date(Date.now() - settings.target_stale_days * 24 * 60 * 60 * 1000).toISOString();
  let connection_status: string;
  if (referral_targets.length > 0) {
    connection_status = oldestTargetCreated && oldestTargetCreated < staleCutoff ? "stale" : "found";
  } else if (eligible) {
    connection_status = "not_found";
  } else {
    connection_status = "n/a";
  }
  const eligible_for_connections = eligible || (job.company != null && String(job.company).trim() !== "");

  let suggestions: Array<{ emphasize: string; where: string; example: string }> = [];
  try {
    if (job.suggestions_json) {
      const parsed = JSON.parse(job.suggestions_json);
      if (Array.isArray(parsed)) suggestions = parsed;
    }
  } catch {
    // ignore
  }

  const recommendations = getExistingRecommendations(id).length > 0
    ? getExistingRecommendations(id)
    : getRecommendationsForJob(id);

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      location: job.location,
      url: job.url,
      external_id: job.external_id,
      company: job.company ?? null,
      date_posted: job.posted_at ?? job.first_seen_at ?? job.created_at ?? null,
      bucket: job.bucket ?? null,
      final_fit_score: job.final_fit_score ?? null,
      resume_match: job.resume_match ?? null,
    },
    recommendations: recommendations.map(({ person, job_person }) => ({
      person: { id: person.id, name: person.name, title: person.title, company: person.company, linkedin_url: person.linkedin_url, relationship_type: person.relationship_type, connection_status: person.connection_status },
      message_type: job_person.message_type,
      drafted_message: job_person.drafted_message,
      outreach_status: job_person.outreach_status,
    })),
    referral_targets,
    connection_status,
    eligible_for_connections,
    suggestions,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: { person_id?: number; slot?: number; outreach_status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { person_id: personId, slot, outreach_status: outreachStatus } = body;
  if (typeof outreachStatus !== "string") {
    return NextResponse.json({ error: "outreach_status required" }, { status: 400 });
  }
  const allowed = ["queued", "sent", "responded"];
  if (!allowed.includes(outreachStatus)) {
    return NextResponse.json({ error: "Invalid outreach_status" }, { status: 400 });
  }

  if (typeof slot === "number" && Number.isInteger(slot) && slot >= 1 && slot <= 4) {
    updateReferralTargetStatus(id, slot, outreachStatus);
    return NextResponse.json({ ok: true });
  }
  if (typeof personId === "number" && Number.isInteger(personId)) {
    updateOutreachStatus(id, personId, outreachStatus);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: "Either person_id or slot (1–4) required" },
    { status: 400 }
  );
}
