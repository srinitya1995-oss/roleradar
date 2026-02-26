import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const BUCKET_LABELS: Record<string, string> = {
  APPLY_NOW: "Apply now",
  STRONG_FIT: "Strong fit",
  NEAR_MATCH: "Near match",
  REVIEW: "Review",
  HIDE: "Hidden",
};

type Job = {
  id: number;
  title: string | null;
  location: string | null;
  url: string | null;
  external_id: string | null;
  company?: string | null;
  date_posted?: string | null;
  bucket?: string | null;
  final_fit_score?: number | null;
  resume_match?: number | null;
};

type Person = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  relationship_type: string | null;
  connection_status: string | null;
};

type Recommendation = {
  person: Person;
  message_type: string;
  drafted_message: string;
  outreach_status: string;
};

type ReferralTarget = {
  slot: number;
  target_type: string;
  search_url: string;
  why_selected: string;
  confidence?: number | null;
  archetype?: string | null;
  source?: string | null;
  outreach_status: string;
  drafted_message: string;
};

type Suggestion = { emphasize: string; where: string; example: string };

/** DB stores UTC; format in laptop (local) timezone. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const s = iso.trim();
    const asUtc = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)
      ? s.replace(" ", "T") + "Z"
      : s;
    const d = new Date(asUtc);
    if (isNaN(d.getTime())) return "";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
  } catch {
    return "";
  }
}

function targetTypeLabel(type: string): string {
  const m: Record<string, string> = {
    recruiter: "Recruiter",
    hiring_manager: "Hiring Manager",
    team_pm_or_peer: "Team PM / Peer",
    high_signal_connector: "High-Signal Connector",
  };
  return m[type] ?? type;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" onClick={copy} className="copy-btn">
      {copied ? "Copied" : "Copy message"}
    </button>
  );
}

const OUTREACH_OPTIONS = ["queued", "sent", "responded"];

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [job, setJob] = useState<Job | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [referralTargets, setReferralTargets] = useState<ReferralTarget[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>("n/a");
  const [eligibleForConnections, setEligibleForConnections] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  const loadJob = (refreshTargets = false) => {
    if (typeof id !== "string" || !id) return;
    const url = refreshTargets ? `/api/jobs/${id}?refresh_targets=1&t=${Date.now()}` : `/api/jobs/${id}`;
    if (refreshTargets) setRefreshing(true);
    fetch(url, refreshTargets ? { cache: "no-store" } : undefined)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: {
        job: Job;
        recommendations: Recommendation[];
        referral_targets: ReferralTarget[];
        connection_status?: string;
        eligible_for_connections?: boolean;
        suggestions?: Suggestion[];
      }) => {
        setJob(data.job);
        setEligibleForConnections(data.eligible_for_connections ?? true);
        setRecommendations(data.recommendations ?? []);
        setReferralTargets(data.referral_targets ?? []);
        setConnectionStatus(data.connection_status ?? "n/a");
        setSuggestions(data.suggestions ?? []);
        setDetailsCollapsed((data.job?.bucket ?? "") === "HIDE");
      })
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => {
    if (typeof id !== "string" || !id) return;
    const url = new URL(window.location.href);
    const refreshTargets = url.searchParams.get("refresh_targets") === "1";
    loadJob(refreshTargets);
  }, [id]);

  const updateStatus = (personId: number, outreachStatus: string) => {
    if (!job) return;
    fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: personId, outreach_status: outreachStatus }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(() => {
        setRecommendations((prev) =>
          prev.map((rec) =>
            rec.person.id === personId ? { ...rec, outreach_status: outreachStatus } : rec
          )
        );
      })
      .catch(() => {});
  };

  const updateReferralTargetStatus = (slot: number, outreachStatus: string) => {
    if (!job) return;
    fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, outreach_status: outreachStatus }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(() => {
        setReferralTargets((prev) =>
          prev.map((t) => (t.slot === slot ? { ...t, outreach_status: outreachStatus } : t))
        );
      })
      .catch(() => {});
  };

  if (loading || !id) return <div className="inbox-loading">Loading…</div>;
  if (error) return <div className="inbox-error">Error: {error}</div>;
  if (!job) return <div className="inbox-error">Job not found.</div>;

  const bucketLabel = BUCKET_LABELS[job.bucket ?? ""] ?? job.bucket ?? "—";
  const showRefresh = (connectionStatus === "stale" || connectionStatus === "not_found") && eligibleForConnections;

  return (
    <>
      <Head>
        <title>Role Radar – {job.title ?? "Job"}</title>
        <link href="/_next/static/css/app/layout.css" rel="stylesheet" />
      </Head>
      <div className="inbox-page" style={{ padding: "1.5rem", maxWidth: "56rem", margin: "0 auto" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link href="/inbox" style={{ color: "inherit", textDecoration: "underline" }}>← Inbox</Link>
        </p>
        <div className="job-detail-header">
          <h1>{job.title ?? "Untitled"}</h1>
          <div className="job-detail-meta">
            {job.company && <span className="company">{job.company}</span>}
            <span className="date-posted">Posted {job.date_posted ? formatDate(job.date_posted) : "—"}</span>
            {job.location && <span className="location">{job.location}</span>}
            <span className="bucket-badge">{bucketLabel}</span>
            {job.final_fit_score != null && <span className="score">Fit {job.final_fit_score}</span>}
            {job.resume_match != null && <span className="score">Resume {job.resume_match}</span>}
          </div>
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-link">
              View job posting
            </a>
          )}
        </div>

        {detailsCollapsed && (
          <p>
            <button type="button" onClick={() => setDetailsCollapsed(false)} className="copy-btn">
              Show details
            </button>
          </p>
        )}

        {!detailsCollapsed && (
          <>
            <section className="outreach-section find-connections-section">
              <h2>Find connections</h2>
              <p className="find-connections-copy">
                Up to 4 outreach targets: Recruiter, Hiring Manager, Team PM/Peer, High-signal connector. Use the search links to find them on LinkedIn.
              </p>
              {showRefresh && (
                <p className="refresh-targets-row">
                  <button
                    type="button"
                    onClick={() => loadJob(true)}
                    disabled={refreshing}
                    className="copy-btn"
                  >
                    {refreshing ? "Refreshing…" : "Refresh targets"}
                  </button>
                  {connectionStatus === "stale" && <span className="connection-status-badge">Targets older than 14 days</span>}
                </p>
              )}
              {referralTargets.length > 0 && (
                <ul className="outreach-list">
                  {[1, 2, 3, 4].map((slot) => {
                    const t = referralTargets.find((x) => x.slot === slot);
                    if (!t) return <li key={slot} className="outreach-card slot-empty">Slot {slot}: —</li>;
                    return (
                      <li key={t.slot} className="outreach-card">
                        <div className="outreach-person">
                          <strong className="target-type">{targetTypeLabel(t.target_type)}</strong>
                          {t.confidence != null && <span className="target-confidence"> {t.confidence}%</span>}
                          {t.source && <span className="target-source"> ({t.source})</span>}
                        </div>
                        <p className="why-selected">{t.why_selected}</p>
                        <p className="search-link">
                          <a href={t.search_url} target="_blank" rel="noopener noreferrer">
                            Suggested search (Google → LinkedIn)
                          </a>
                        </p>
                        <div className="outreach-message-preview">
                          {t.drafted_message.slice(0, 120)}
                          {t.drafted_message.length > 120 ? "…" : ""}
                        </div>
                        <div className="outreach-actions">
                          <CopyButton text={t.drafted_message} />
                          <label className="outreach-status-label">
                            Status{" "}
                            <select
                              value={t.outreach_status}
                              onChange={(e) => updateReferralTargetStatus(t.slot, e.target.value)}
                              className="outreach-status-select"
                            >
                              {OUTREACH_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {referralTargets.length === 0 && !eligibleForConnections && (
                <p className="outreach-empty">
                  Connections are auto-generated for Apply now, Strong fit, and Near match jobs. <button type="button" onClick={() => loadJob(true)} className="copy-btn">Generate targets</button> to run the finder anyway.
                </p>
              )}
              {referralTargets.length === 0 && eligibleForConnections && (
                <p className="outreach-empty">
                  {refreshing ? "Refreshing…" : "No connection targets yet. "}
                  <button type="button" onClick={() => loadJob(true)} disabled={refreshing} className="copy-btn">Find connections</button>
                  <span style={{ marginLeft: "0.5rem", color: "#666", fontSize: "0.9rem" }}>Generates Recruiter, Hiring Manager, Team PM/Peer, High-Signal Connector.</span>
                </p>
              )}
            </section>

            {suggestions.length > 0 && (
              <section className="outreach-section suggestions-section">
                <h2>Suggested resume emphasis</h2>
                <p className="find-connections-copy">Tailored keyword tweaks for this role (Near match).</p>
                <ul className="suggestions-list">
                  {suggestions.map((s, i) => (
                    <li key={i} className="suggestion-item">
                      <strong>{s.emphasize}</strong> — {s.where}
                      <blockquote>{s.example}</blockquote>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recommendations.length > 0 && (
              <section className="outreach-section people-section">
                <h2>People to connect & ask for referral</h2>
                <p className="find-connections-copy">From your network: same company, Ex-Amazon, or profile match. Copy message and track status.</p>
                <ul className="outreach-list">
                  {recommendations.map((rec) => (
                    <li key={rec.person.id} className="outreach-card">
                      <div className="outreach-person">
                        <strong>
                          {rec.person.linkedin_url ? (
                            <a href={rec.person.linkedin_url} target="_blank" rel="noopener noreferrer">
                              {rec.person.name}
                            </a>
                          ) : (
                            rec.person.name
                          )}
                        </strong>
                        {rec.person.title && <span> · {rec.person.title}</span>}
                        {rec.person.company && <span> · {rec.person.company}</span>}
                        <div className="outreach-meta">
                          {rec.person.relationship_type && <span className="rel-type">{rec.person.relationship_type}</span>}
                          {rec.person.connection_status && <span className="conn-status">{rec.person.connection_status}</span>}
                        </div>
                      </div>
                      <div className="outreach-message-preview">
                        {rec.drafted_message.slice(0, 120)}
                        {rec.drafted_message.length > 120 ? "…" : ""}
                      </div>
                      <div className="outreach-actions">
                        <CopyButton text={rec.drafted_message} />
                        <label className="outreach-status-label">
                          Status{" "}
                          <select
                            value={rec.outreach_status}
                            onChange={(e) => updateStatus(rec.person.id, e.target.value)}
                            className="outreach-status-select"
                          >
                            {OUTREACH_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <style jsx global>{`
        .inbox-page h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .job-detail-header { margin-bottom: 1.5rem; }
        .job-detail-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; font-size: 0.875rem; opacity: 0.85; margin-top: 0.35rem; }
        .job-detail-meta .company { font-weight: 500; }
        .job-detail-meta .date-posted { color: #555; }
        .job-detail-meta .bucket-badge { font-weight: 600; color: #059669; }
        .job-detail-meta .score { font-size: 0.8125rem; color: #6b7280; margin-left: 0.25rem; }
        .job-detail-header .location { font-size: 0.875rem; opacity: 0.8; }
        .job-link { display: inline-block; margin-top: 0.5rem; font-size: 0.875rem; }
        .outreach-section { margin-top: 1.5rem; }
        .find-connections-section { margin-top: 1rem; }
        .find-connections-section h2 { font-size: 1.2rem; margin-bottom: 0.35rem; }
        .find-connections-copy { font-size: 0.9rem; color: #555; margin-bottom: 1rem; line-height: 1.4; }
        .refresh-targets-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
        .connection-status-badge { font-size: 0.8rem; color: #b45309; }
        .outreach-section h2 { font-size: 1.1rem; margin-bottom: 0.75rem; }
        .outreach-list { list-style: none; padding: 0; margin: 0; }
        .outreach-card { border: 1px solid #333; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
        .outreach-card.slot-empty { opacity: 0.6; }
        .outreach-person { margin-bottom: 0.5rem; }
        .outreach-person a { color: inherit; }
        .outreach-meta { font-size: 0.8rem; opacity: 0.85; margin-top: 0.25rem; }
        .rel-type, .conn-status { margin-right: 0.75rem; }
        .outreach-message-preview { font-size: 0.875rem; color: #444; margin: 0.5rem 0; line-height: 1.4; }
        .outreach-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .copy-btn { font-size: 0.8125rem; padding: 0.35rem 0.6rem; cursor: pointer; border-radius: 4px; border: 1px solid #555; background: #e5e7eb; color: #111827; }
        .copy-btn:hover { background: #374151; color: #f9fafb; }
        .copy-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .outreach-status-label { font-size: 0.8125rem; }
        .outreach-status-select { margin-left: 0.25rem; padding: 0.2rem 0.4rem; }
        .outreach-empty { font-size: 0.9rem; color: #666; }
        .target-type { font-size: 1rem; }
        .target-confidence { font-weight: 600; color: #059669; margin-left: 0.25rem; }
        .target-source { font-size: 0.8rem; color: #6b7280; font-weight: 400; margin-left: 0.25rem; }
        .why-selected { font-size: 0.875rem; color: #444; margin: 0.5rem 0; line-height: 1.4; }
        .search-link { font-size: 0.875rem; margin: 0.25rem 0; }
        .search-link a { color: #2563eb; text-decoration: underline; }
        .suggestions-list { list-style: none; padding: 0; margin: 0; }
        .suggestion-item { margin-bottom: 1rem; font-size: 0.9rem; }
        .suggestion-item blockquote { margin: 0.35rem 0 0 1rem; font-size: 0.85rem; color: #555; border-left: 3px solid #ddd; padding-left: 0.5rem; }
        .inbox-loading, .inbox-error { padding: 2rem; text-align: center; }
      `}</style>
    </>
  );
}
