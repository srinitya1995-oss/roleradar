import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { connectNote } from "@/src/lib/messages";
import {
  getRecommendationsForJob,
  getExistingRecommendations,
  updateOutreachStatus,
} from "@/src/lib/recommendations";
import {
  eligibleForConnections,
  getOrCreateReferralTargetsForJob,
  getReferralTargetsForJob,
  saveReferralTargets,
  updateReferralTargetStatus,
} from "@/src/lib/referral-targets";
import {
  getReferralTargetsFromLLMV2,
  llmTargetToSearchUrl,
} from "@/src/lib/referral-llm";

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
  company?: string | null;
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
    "SELECT j.id, j.title, j.location, j.url, j.external_id, j.cpi, j.tier, j.source_id, j.created_at, j.posted_at, s.company FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?"
  ).get(id) as JobRow | undefined;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let recommendations = getExistingRecommendations(id);
  if (recommendations.length === 0) {
    recommendations = getRecommendationsForJob(id);
  }

  const eligible = eligibleForConnections(job.tier ?? null, job.cpi ?? null);
  const url = new URL(request.url);
  const refreshTargets = url.searchParams.get("refresh_targets") === "1";
  const shouldAutoGenerate = eligible || refreshTargets;

  let referral_targets: Array<{
    slot: number;
    target_type: string;
    search_url: string;
    why_selected: string;
    confidence: number | null;
    archetype: string | null;
    source: string | null;
    outreach_status: string;
    drafted_message: string;
  }> = [];

  if (shouldAutoGenerate) {
    const existingTargets = getReferralTargetsForJob(id);
    const useLLM =
      Boolean(process.env.OPENAI_API_KEY) &&
      (refreshTargets || (existingTargets.length === 0 && eligible));

    if (useLLM) {
      try {
        const jobDetail = db
          .prepare(
            "SELECT j.title, j.description, j.location, j.external_id, s.company FROM jobs j LEFT JOIN job_sources s ON j.source_id = s.id WHERE j.id = ?"
          )
          .get(id) as { title: string | null; description: string | null; location: string | null; external_id: string | null; company: string | null } | undefined;
        if (jobDetail) {
          const company = (jobDetail.company ?? "").trim() || "Company";
          const jobIdStr = jobDetail.external_id ?? String(id);
          const payload = await getReferralTargetsFromLLMV2({
            title: jobDetail.title,
            company,
            job_id: jobIdStr,
            description: jobDetail.description,
            location: jobDetail.location,
          });
          if (payload?.targets?.length) {
            const displayNames: Record<string, string> = {
              recruiter: "Recruiter",
              hiring_manager: "Hiring Manager",
              high_signal_connector: "High-Signal Connector",
            };
            saveReferralTargets(
              id,
              payload.targets.map((t, i) => ({
                slot: i + 1,
                target_type: t.target_type,
                search_query: t.search_query,
                search_url: llmTargetToSearchUrl(t.search_query, company),
                why_selected: t.why_selected,
                confidence: t.confidence ?? 70,
                archetype: payload.archetype ?? null,
                source: "llm",
                drafted_message: connectNote(displayNames[t.target_type] ?? t.target_type, jobIdStr),
              }))
            );
          }
        }
      } catch {
        // LLM failed; fall through to heuristic
      }
    }

    const targets = getReferralTargetsForJob(id).length > 0
      ? getReferralTargetsForJob(id)
      : getOrCreateReferralTargetsForJob(id);
    referral_targets = targets.map((t) => ({
      slot: t.slot,
      target_type: t.target_type,
      search_url: t.search_url,
      why_selected: t.why_selected,
      confidence: t.confidence ?? null,
      archetype: t.archetype ?? null,
      source: t.source ?? null,
      outreach_status: t.outreach_status,
      drafted_message: t.drafted_message,
    }));
  }

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      location: job.location,
      url: job.url,
      external_id: job.external_id,
      cpi: job.cpi,
      tier: job.tier,
      company: job.company ?? null,
      date_posted: job.posted_at ?? job.created_at ?? null,
    },
    recommendations: recommendations.map(({ person, job_person }) => ({
      person: {
        id: person.id,
        name: person.name,
        title: person.title,
        company: person.company,
        linkedin_url: person.linkedin_url,
        relationship_type: person.relationship_type,
        connection_status: person.connection_status,
      },
      message_type: job_person.message_type,
      drafted_message: job_person.drafted_message,
      outreach_status: job_person.outreach_status,
    })),
    referral_targets,
    eligible_for_connections: eligible,
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

  if (typeof slot === "number" && Number.isInteger(slot) && slot >= 1 && slot <= 3) {
    updateReferralTargetStatus(id, slot, outreachStatus);
    return NextResponse.json({ ok: true });
  }
  if (typeof personId === "number" && Number.isInteger(personId)) {
    updateOutreachStatus(id, personId, outreachStatus);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: "Either person_id or slot (1–3) required" },
    { status: 400 }
  );
}
