"use client";

import { useEffect, useState } from "react";
import { connectNote, referralMessage } from "@/src/lib/messages";

type Job = { id: number; title: string | null; location: string | null; url: string | null; external_id: string | null; cpi: number | null; tier: string | null };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" onClick={copy} className="copy-btn">
      {copied ? "Copied" : label}
    </button>
  );
}

function JobCard({ job, recruiterName = "there" }: { job: Job; recruiterName?: string }) {
  const jobId = job.external_id ?? String(job.id);
  const connect = connectNote(recruiterName, jobId);
  const referral = referralMessage(recruiterName, jobId);
  return (
    <article className="job-card">
      <div className="job-header">
        <h3><a href={job.url ?? "#"} target="_blank" rel="noopener noreferrer">{job.title ?? "Untitled"}</a></h3>
        {job.location && <span className="location">{job.location}</span>}
        {job.cpi != null && <span className="cpi">CPI {job.cpi}</span>}
      </div>
      <div className="job-actions">
        <CopyButton text={connect} label="Copy connect note" />
        <CopyButton text={referral} label="Copy referral ask" />
      </div>
    </article>
  );
}

function TierSection({ title, jobs }: { title: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="tier-section">
      <h2>{title} ({jobs.length})</h2>
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatMinutesAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return "just now";
  if (min === 1) return "1 min ago";
  return `${min} min ago`;
}

function nextUpdateInMin(lastPollAt: string | null, pollIntervalMs: number): number | null {
  if (!lastPollAt || !pollIntervalMs) return null;
  const nextAt = new Date(lastPollAt).getTime() + pollIntervalMs;
  const min = Math.ceil((nextAt - Date.now()) / 60000);
  return min <= 0 ? 0 : min;
}

export default function InboxPage() {
  const [data, setData] = useState<{ top5: Job[]; top20: Job[]; reject: Job[] } | null>(null);
  const [agentStatus, setAgentStatus] = useState<{
    live: boolean;
    lastPollAt: string | null;
    pollIntervalMs?: number;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(r.statusText)))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const fetchStatus = () => {
      fetch("/api/agent-status")
        .then((r) => r.ok ? r.json() : { live: false, lastPollAt: null, pollIntervalMs: 30 * 60 * 1000 })
        .then(setAgentStatus)
        .catch(() => setAgentStatus({ live: false, lastPollAt: null }));
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const nextMin =
    agentStatus?.live && agentStatus.lastPollAt && agentStatus.pollIntervalMs
      ? nextUpdateInMin(agentStatus.lastPollAt, agentStatus.pollIntervalMs)
      : null;

  if (loading) return <div className="inbox-loading">Loading jobs…</div>;
  if (error) return <div className="inbox-error">Error: {error}</div>;
  if (!data) return null;

  return (
    <main className="inbox-page">
      <h1>Role Radar · Inbox</h1>
      <p className="agent-status" aria-live="polite">
        {agentStatus?.live ? (
          <>
            Agent: <strong>Live</strong>
            {" · "}
            last poll {agentStatus.lastPollAt ? formatMinutesAgo(agentStatus.lastPollAt) : "—"}
            {nextMin !== null && (
              <> · next update in <strong>{nextMin} min</strong></>
            )}
          </>
        ) : (
          <>Agent: <strong>Not running</strong> · run <code>npm run agent</code> to poll 24/7</>
        )}
      </p>
      <TierSection title="Top 5%" jobs={data.top5} />
      <TierSection title="Top 20%" jobs={data.top20} />
      <TierSection title="Reject" jobs={data.reject} />
    </main>
  );
}
