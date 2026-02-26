/**
 * Email notifications when new jobs fit your criteria (Apply now, Strong fit, top Near match).
 * Uses Resend. Set NOTIFY_EMAIL and RESEND_API_KEY in .env.
 */

import { Resend } from "resend";

export type NotifyJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  cpi?: number | null;
  tier?: string | null;
  bucket?: string | null;
  final_fit_score?: number | null;
  resume_match?: number | null;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "";
const NOTIFY_FROM = process.env.NOTIFY_FROM ?? "Role Radar <onboarding@resend.dev>";

export function canSendEmail(): boolean {
  return Boolean(RESEND_API_KEY && NOTIFY_EMAIL);
}

export async function sendJobsNotification(jobs: NotifyJob[], inboxUrl?: string): Promise<{ ok: boolean; error?: string }> {
  if (!canSendEmail()) {
    return { ok: false, error: "NOTIFY_EMAIL or RESEND_API_KEY not set" };
  }
  if (jobs.length === 0) return { ok: true };

  const resend = new Resend(RESEND_API_KEY);
  const bucketLabel = (j: NotifyJob) => j.bucket ?? j.tier ?? "—";
  const rows = jobs
    .map(
      (j) =>
        `<tr><td><a href="${j.url}">${escapeHtml(j.title)}</a></td><td>${escapeHtml(j.company)}</td><td>${escapeHtml(j.location)}</td><td>${bucketLabel(j)}</td><td>${j.final_fit_score ?? j.cpi ?? "—"}</td><td>${j.resume_match ?? "—"}</td></tr>`
    )
    .join("");

  const inboxLink = inboxUrl ? `<p><a href="${inboxUrl}">Open Role Radar Inbox</a></p>` : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Role Radar – new jobs</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px;">
  <h1>Role Radar</h1>
  <p>${jobs.length} new job${jobs.length === 1 ? "" : "s"} that fit your criteria:</p>
  <table style="width:100%; border-collapse: collapse;">
    <thead><tr style="text-align:left;"><th>Title</th><th>Company</th><th>Location</th><th>Bucket</th><th>Fit</th><th>Resume</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${inboxLink}
  <p style="color:#666; font-size:0.875rem;">You’re getting this because NOTIFY_EMAIL is set and the agent found matching jobs.</p>
</body>
</html>`;

  const subject = `Role Radar: ${jobs.length} new job${jobs.length === 1 ? "" : "s"} (${jobs.map((j) => j.bucket ?? j.tier ?? "").filter(Boolean).join(", ") || "high fit"})`;

  try {
    const { data, error } = await resend.emails.send({
      from: NOTIFY_FROM,
      to: [NOTIFY_EMAIL],
      subject,
      html,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
