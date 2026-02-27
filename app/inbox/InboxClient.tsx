"use client";

import { useCallback, useEffect, useState } from "react";
import { connectNote, referralMessage } from "@/src/lib/messages";

export type Job = { id: number; title: string | null; location: string | null; url: string | null; external_id: string | null; cpi?: number | null; tier?: string | null; bucket?: string | null; connection_status?: string; company?: string | null };

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

/** LinkedIn People search: Product Managers who used to work at Amazon (company ID 1586). Optionally narrow by current company name in keywords. */
function linkedInFormerAmazoniansUrl(companyName: string | null | undefined): string {
  const base = "https://www.linkedin.com/search/results/people/?keywords=Product%20Manager&pastCompany=%221586%22";
  const company = (companyName ?? "").trim();
  if (!company) return base;
  return `${base}&keywords=Product%20Manager%20${encodeURIComponent(company)}`;
}

function JobCard({ job, recruiterName = "there" }: { job: Job; recruiterName?: string }) {
  const jobId = job.external_id ?? String(job.id);
  const connect = connectNote(recruiterName, jobId);
  const referral = referralMessage(recruiterName, jobId);
  const showRefresh = job.connection_status === "stale" || job.connection_status === "not_found";
  const showConnectionsLink = job.bucket === "APPLY_NOW" || job.bucket === "STRONG_FIT";
  const connectionsUrl = linkedInFormerAmazoniansUrl(job.company);
  return (
    <article className="job-card">
      <div className="job-header">
        <h3><a href={job.url ?? "#"} target="_blank" rel="noopener noreferrer">{job.title ?? "Untitled"}</a></h3>
        {job.location && <span className="location">{job.location}</span>}
        {job.bucket && <span className="bucket-badge">{job.bucket}</span>}
      </div>
      <div className="job-actions">
        <CopyButton text={connect} label="Copy connect note" />
        <CopyButton text={referral} label="Copy referral ask" />
        {showConnectionsLink && (
          <a href={connectionsUrl} target="_blank" rel="noopener noreferrer" className="connections-link">
            Find former Amazonians at this company
          </a>
        )}
        {showRefresh && (
          <a href={`/job/${job.id}?refresh_targets=1`} className="refresh-targets-link">Refresh targets</a>
        )}
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

type InboxData = {
  top5: Job[];
  top20: Job[];
  rejectedRelevantOnly?: Job[];
  reject?: Job[];
  other?: Job[];
};

/** Server can pass unknown[]; we normalize to Job[] on first render. */
function toInboxData(raw: {
  top5?: unknown[];
  top20?: unknown[];
  rejectedRelevantOnly?: unknown[];
  reject?: unknown[];
  other?: unknown[];
}): InboxData {
  return {
    top5: (raw.top5 ?? []) as Job[],
    top20: (raw.top20 ?? []) as Job[],
    rejectedRelevantOnly: (raw.rejectedRelevantOnly ?? []) as Job[],
    reject: (raw.reject ?? []) as Job[],
    other: (raw.other ?? []) as Job[],
  };
}

type AgentStatus = { live: boolean; lastPollAt: string | null; pollIntervalMs?: number };

export default function InboxClient({
  initialData: rawInitialData,
  initialAgentStatus,
}: {
  initialData: { top5?: unknown[]; top20?: unknown[]; rejectedRelevantOnly?: unknown[]; reject?: unknown[]; other?: unknown[] };
  initialAgentStatus: AgentStatus;
}) {
  const initialData = toInboxData(rawInitialData);
  const [data, setData] = useState<InboxData>(initialData);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(initialAgentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    fetch("/api/jobs/list", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) return Promise.reject(new Error(`${r.status} ${r.statusText}`));
        return r.json();
      })
      .then((payload) => {
        setData({
          top5: payload.top5 ?? [],
          top20: payload.top20 ?? [],
          rejectedRelevantOnly: payload.rejectedRelevantOnly ?? [],
          reject: payload.reject ?? [],
          other: payload.other ?? [],
        });
      })
      .catch((e) => {
        if (!silent) setError(e.name === "AbortError" ? "Request timed out" : (e.message || "Failed to load jobs"));
      })
      .finally(() => { clearTimeout(t); if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadJobs(true), 60 * 1000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  useEffect(() => {
    const fetchStatus = () => {
      fetch("/api/agent-status")
        .then((r) => r.ok ? r.json() : { live: false, lastPollAt: null, pollIntervalMs: 30 * 60 * 1000 })
        .then(setAgentStatus)
        .catch(() => setAgentStatus((s) => ({ ...s, live: false, lastPollAt: null })));
    };
    const interval = setInterval(fetchStatus, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const nextMin =
    agentStatus.live && agentStatus.lastPollAt && agentStatus.pollIntervalMs
      ? nextUpdateInMin(agentStatus.lastPollAt, agentStatus.pollIntervalMs)
      : null;

  const hasAnyJobs =
    (data.top5?.length ?? 0) + (data.top20?.length ?? 0) +
    (data.rejectedRelevantOnly?.length ?? 0) + (data.reject?.length ?? 0) + (data.other?.length ?? 0) > 0;

  return (
    <main className="inbox-page">
      <h1>Role Radar · Inbox</h1>
      {loading && (
        <p className="inbox-loading" style={{ marginBottom: "1rem" }}>
          Refreshing…
          <button type="button" onClick={() => loadJobs(false)} className="inbox-refresh-btn" style={{ marginLeft: "0.75rem" }}>Refresh</button>
        </p>
      )}
      {error && (
        <p className="inbox-error" style={{ marginBottom: "1rem" }}>
          {error}
          <button type="button" onClick={() => loadJobs(false)} className="inbox-refresh-btn" style={{ marginLeft: "0.75rem" }}>Try again</button>
        </p>
      )}
      <p className="agent-status" aria-live="polite">
        {agentStatus.live ? (
          <>
            Agent: <strong>Live</strong>
            {" · "}
            jobs from last run
            {" · "}
            last poll {agentStatus.lastPollAt ? formatMinutesAgo(agentStatus.lastPollAt) : "—"}
            {nextMin !== null && (
              <> · next update in <strong>{nextMin} min</strong></>
            )}
          </>
        ) : (
          <>Agent: <strong>Not running</strong> · run <code>npm run agent</code> (or <code>npm run dev:full</code>) to search jobs and warm connections</>
        )}
      </p>
      <TierSection title="Apply now" jobs={data.top5 ?? []} />
      <TierSection title="Strong fit" jobs={data.top20 ?? []} />
      <TierSection title="Near match" jobs={data.rejectedRelevantOnly ?? []} />
      <TierSection title="Review" jobs={data.reject ?? []} />
      <TierSection title="Hidden" jobs={data.other ?? []} />
      {!hasAnyJobs && !loading && (
        <section className="inbox-empty" style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f5f5f5", borderRadius: "8px", maxWidth: "32rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>No jobs yet</h2>
          <p style={{ margin: "0.5rem 0", color: "#444" }}>
            Seed job sources, then fetch jobs. In the project root run:
          </p>
          <pre style={{ margin: "0.75rem 0", padding: "0.75rem", background: "#fff", borderRadius: "4px", overflow: "auto", fontSize: "0.9rem" }}>
            npm run seed-top-companies{"\n"}
            npm run poll
          </pre>
          <p style={{ margin: "0.5rem 0", color: "#666", fontSize: "0.95rem" }}>
            Then refresh this page. To <strong>search jobs and warm connections automatically</strong>, run the agent: <code>npm run agent</code> (in another terminal) or <code>npm run dev:full</code> (app + agent together). For people recommendations, run <code>npm run seed-people</code>.
          </p>
        </section>
      )}
    </main>
  );
}
