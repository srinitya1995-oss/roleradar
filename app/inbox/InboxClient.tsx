"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export type Job = {
  id: number;
  title: string | null;
  location: string | null;
  url: string | null;
  external_id: string | null;
  bucket?: string | null;
  company?: string | null;
  profile_match_pct?: number | null;
  final_fit_score?: number | null;
  connection_status?: string;
  connection_targets?: { type_label: string; why_selected: string; search_url?: string }[];
  tracking_status?: string | null;
};

const TRACKING_OPTIONS = [
  { value: "", label: "—" },
  { value: "asked_for_referral", label: "Asked for referral" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "declined", label: "Declined" },
];

function JobRow({
  job,
  onTrackingChange,
}: {
  job: Job;
  onTrackingChange: (jobId: number, value: string | null) => void;
}) {
  const resumePct = job.profile_match_pct != null ? Math.round(job.profile_match_pct) : null;
  const fitScore = job.final_fit_score != null ? Math.round(job.final_fit_score) : null;
  const connectionLabel = job.connection_status === "found" ? "Found" : job.connection_status === "not_found" ? "Not found" : job.connection_status === "stale" ? "Stale" : "—";
  const trackingValue = job.tracking_status ?? "";

  return (
    <tr className="inbox-job-row">
      <td className="inbox-col-title">
        <a href={job.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inbox-title-link">
          {job.title ?? "Untitled"}
        </a>
      </td>
      <td className="inbox-col-company">{job.company ?? "—"}</td>
      <td className="inbox-col-location">{job.location ?? "—"}</td>
      <td className="inbox-col-resume">{resumePct != null ? `${resumePct}%` : "—"}</td>
      <td className="inbox-col-fit">{fitScore != null ? fitScore : "—"}</td>
      <td className="inbox-col-connection">
        <Link href={`/job/${job.id}`} className="inbox-connection-link">
          {connectionLabel}
        </Link>
      </td>
      <td className="inbox-col-tracking">
        <select
          value={trackingValue}
          onChange={(e) => onTrackingChange(job.id, e.target.value === "" ? null : e.target.value)}
          className="inbox-tracking-select"
          aria-label="Tracking status"
        >
          {TRACKING_OPTIONS.map((opt) => (
            <option key={opt.value || "_"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function InboxTable({ jobs, onTrackingChange }: { jobs: Job[]; onTrackingChange: (jobId: number, value: string | null) => void }) {
  if (jobs.length === 0) return null;
  return (
    <table className="inbox-table">
      <thead>
        <tr>
          <th className="inbox-col-title">Job title</th>
          <th className="inbox-col-company">Company</th>
          <th className="inbox-col-location">Location</th>
          <th className="inbox-col-resume">Resume match</th>
          <th className="inbox-col-fit">Fit score</th>
          <th className="inbox-col-connection">Connection</th>
          <th className="inbox-col-tracking">Tracking status</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} onTrackingChange={onTrackingChange} />
        ))}
      </tbody>
    </table>
  );
}

function TierSection({ title, jobs, onTrackingChange }: { title: string; jobs: Job[]; onTrackingChange: (jobId: number, value: string | null) => void }) {
  if (jobs.length === 0) return null;
  return (
    <section className="inbox-tier-section">
      <h2 className="inbox-tier-title">{title} ({jobs.length})</h2>
      <InboxTable jobs={jobs} onTrackingChange={onTrackingChange} />
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
      .finally(() => {
        clearTimeout(t);
        if (!silent) setLoading(false);
      });
  }, []);

  const updateTracking = useCallback((jobId: number, value: string | null) => {
    fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking_status: value }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to update");
        return r.json();
      })
      .then(() => {
        setData((prev) => {
          const update = (jobs: Job[]) =>
            jobs.map((j) => (j.id === jobId ? { ...j, tracking_status: value } : j));
          return {
            top5: update(prev.top5 ?? []),
            top20: update(prev.top20 ?? []),
            rejectedRelevantOnly: update(prev.rejectedRelevantOnly ?? []),
            reject: update(prev.reject ?? []),
            other: update(prev.other ?? []),
          };
        });
      })
      .catch(() => setError("Failed to update tracking status"));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadJobs(true), 60 * 1000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  useEffect(() => {
    const fetchStatus = () => {
      fetch("/api/agent-status")
        .then((r) => (r.ok ? r.json() : { live: false, lastPollAt: null, pollIntervalMs: 30 * 60 * 1000 }))
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
    (data.top5?.length ?? 0) +
    (data.top20?.length ?? 0) +
    (data.rejectedRelevantOnly?.length ?? 0) +
    (data.reject?.length ?? 0) +
    (data.other?.length ?? 0) >
    0;

  return (
    <main className="inbox-page">
      <h1>Role Radar · Inbox</h1>
      {loading && (
        <p className="inbox-loading" style={{ marginBottom: "1rem" }}>
          Refreshing…
          <button type="button" onClick={() => loadJobs(false)} className="inbox-refresh-btn" style={{ marginLeft: "0.75rem" }}>
            Refresh
          </button>
        </p>
      )}
      {error && (
        <p className="inbox-error" style={{ marginBottom: "1rem" }}>
          {error}
          <button type="button" onClick={() => loadJobs(false)} className="inbox-refresh-btn" style={{ marginLeft: "0.75rem" }}>
            Try again
          </button>
        </p>
      )}
      <p className="agent-status" aria-live="polite">
        {agentStatus.live ? (
          <>
            Agent: <strong>Live</strong>
            {" · "}
            last poll {agentStatus.lastPollAt ? formatMinutesAgo(agentStatus.lastPollAt) : "—"}
            {nextMin !== null && (
              <>
                {" · "}
                next update in <strong>{nextMin} min</strong>
              </>
            )}
          </>
        ) : (
          <>
            Agent: <strong>Not running</strong> · run <code>npm run agent</code> to search jobs and warm connections
          </>
        )}
      </p>
      <TierSection title="Apply now" jobs={data.top5 ?? []} onTrackingChange={updateTracking} />
      <TierSection title="Strong fit" jobs={data.top20 ?? []} onTrackingChange={updateTracking} />
      <TierSection title="Near match" jobs={data.rejectedRelevantOnly ?? []} onTrackingChange={updateTracking} />
      <TierSection title="Review" jobs={data.reject ?? []} onTrackingChange={updateTracking} />
      <TierSection title="Hidden" jobs={data.other ?? []} onTrackingChange={updateTracking} />
      {!hasAnyJobs && !loading && (
        <section className="inbox-empty" style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f5f5f5", borderRadius: "8px", maxWidth: "32rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>No jobs yet</h2>
          <p style={{ margin: "0.5rem 0", color: "#444" }}>Run <code>npm run seed-type4</code> and <code>npm run poll</code>, then refresh.</p>
        </section>
      )}
    </main>
  );
}
