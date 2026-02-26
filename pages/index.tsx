import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

type ConnectionTarget = { type_label: string; why_selected: string; confidence?: number | null };

type Job = {
  id: number;
  title: string | null;
  location: string | null;
  url: string | null;
  external_id: string | null;
  cpi: number | null;
  tier: string | null;
  company?: string | null;
  date_posted?: string | null;
  match_label?: string;
  profile_match_pct?: number;
  match_pct?: number;
  connection_status?: "n/a" | "not_found" | "found";
  connection_targets?: ConnectionTarget[];
};

/** Brand colors (logo-style) for company sections and company name text. */
const COMPANY_COLORS: Record<string, string> = {
  Adobe: "#ED1C24",
  OpenAI: "#412991",
  Anthropic: "#CC785C",
  Uber: "#000000",
  Airbnb: "#FF5A5F",
  Other: "#1f2937",
};
function getCompanyColor(company: string): string {
  return COMPANY_COLORS[company] ?? "#1f2937";
}

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

function JobRow({ job, companyColor }: { job: Job; companyColor: string }) {
  const isPursuable = job.cpi != null && job.cpi >= 5;
  return (
    <tr className="job-row">
      <td className="job-title-cell">
        <Link href={`/job/${job.id}`}>{job.title ?? "Untitled"}</Link>
        {!isPursuable && job.url && (
          <> · <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-external-link">Posting</a></>
        )}
      </td>
      <td className="job-company-cell" style={{ color: companyColor, fontWeight: 600 }}>
        {job.company ?? "—"}
      </td>
      <td className="job-date-cell">{job.date_posted ? formatDate(job.date_posted) : "—"}</td>
      <td className="job-cpi-cell">{job.cpi != null ? `CPI ${job.cpi}` : "—"}</td>
      <td className="job-connections-cell">
        {(job.connection_status === "n/a" || !job.connection_status) && "N/A"}
        {job.connection_status === "not_found" && "Not found"}
        {job.connection_status === "found" && job.connection_targets && job.connection_targets.length > 0 && (
          <ul className="connections-list">
            {job.connection_targets.map((t, i) => (
              <li key={i}>
                <strong>{t.type_label}</strong>
                {t.confidence != null && <span className="connection-confidence"> {t.confidence}%</span>}
                {": "}{t.why_selected}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="job-match-cell">
        <span className={`match-badge match-${(job.match_label ?? "Review").toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "")}`}>
          {job.match_label ?? "Review"}
        </span>
        {(job.match_pct != null || job.cpi != null) && (
          <span className="match-pct">{job.match_pct != null ? job.match_pct : Math.round((job.cpi! / 10) * 100)}%</span>
        )}
      </td>
    </tr>
  );
}

function CompanySection({ company, jobs }: { company: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;
  const brandColor = getCompanyColor(company);
  const isDark = ["#000000", "#412991", "#1f2937"].includes(brandColor);
  return (
    <section className="company-section">
      <h2
        className="company-heading"
        style={{
          background: brandColor,
          color: isDark ? "#fff" : "#1a1a1a",
          borderBottom: `2px solid ${brandColor}`,
        }}
      >
        {company}
      </h2>
      <div className="company-table-wrap">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Company</th>
              <th>Date posted</th>
              <th>CPI</th>
              <th>Connections</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} companyColor={brandColor} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Home() {
  const [data, setData] = useState<{ jobsByCompany: { company: string; jobs: Job[] }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(r.statusText)))
      .then((res) => setData({ jobsByCompany: res.jobsByCompany ?? [] }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasAny = data && data.jobsByCompany.some((s) => s.jobs.length > 0);

  return (
    <>
      <Head>
        <title>Role Radar</title>
        <link href="/_next/static/css/app/layout.css" rel="stylesheet" />
      </Head>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <h1>Role Radar</h1>
          <p className="dashboard-subtitle">Jobs by company · last 7 days · all visible</p>
        </header>
        {loading && <div className="inbox-loading">Loading jobs…</div>}
        {error && <div className="inbox-error">Error: {error}</div>}
        {data && !hasAny && (
          <p className="inbox-empty">
            No jobs in the last 7 days. Run <code>npm run poll</code> to fetch new jobs.
          </p>
        )}
        {data && hasAny && (
          <div className="dashboard-sections">
            {data.jobsByCompany.map(({ company, jobs }) => (
              <CompanySection key={company} company={company} jobs={jobs} />
            ))}
          </div>
        )}
      </div>
      <style jsx global>{`
        .dashboard-page { padding: 1.5rem; max-width: 64rem; margin: 0 auto; }
        .dashboard-header { margin-bottom: 1.5rem; }
        .dashboard-header h1 { font-size: 1.75rem; margin: 0 0 0.25rem 0; font-weight: 600; }
        .dashboard-subtitle { font-size: 0.9rem; color: #555; margin: 0; }
        .inbox-loading, .inbox-error { padding: 2rem; text-align: center; }
        .inbox-empty { color: #666; margin-top: 1rem; }
        .inbox-empty code { background: #eee; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.875rem; }
        .dashboard-sections { display: flex; flex-direction: column; gap: 2rem; }
        .company-section { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
        .company-heading { font-size: 1.1rem; margin: 0; padding: 0.75rem 1rem; font-weight: 700; }
        .company-table-wrap { overflow-x: auto; }
        .jobs-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .jobs-table th { text-align: left; padding: 0.5rem 1rem; background: #f9fafb; color: #374151; font-weight: 600; }
        .jobs-table td { padding: 0.6rem 1rem; border-top: 1px solid #e5e7eb; }
        .job-row:hover { background: #f9fafb; }
        .job-title-cell a { color: #111; font-weight: 500; }
        .job-title-cell a:hover { text-decoration: underline; }
        .job-title-cell .job-external-link { font-size: 0.85em; color: #6b7280; font-weight: 400; }
        .job-company-cell { font-weight: 600; }
        .job-date-cell { color: #6b7280; white-space: nowrap; }
        .job-cpi-cell { font-weight: 700; color: #111; }
        .job-connections-cell { max-width: 20rem; font-size: 0.85rem; font-weight: 600; color: #0A66C2; }
        .connections-list { margin: 0; padding-left: 1.1rem; list-style: disc; color: #0A66C2; }
        .connections-list li { margin-bottom: 0.25rem; }
        .connections-list li:last-child { margin-bottom: 0; }
        .connections-list strong { color: #0A66C2; font-weight: 700; }
        .connection-confidence { font-weight: 600; opacity: 0.9; }
        .job-match-cell { white-space: nowrap; }
        .job-match-cell .match-pct { margin-left: 0.5rem; font-weight: 600; color: #374151; }
        .match-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 500; }
        .match-resume-match { background: #d1fae5; color: #065f46; }
        .match-good-match { background: #dbeafe; color: #1e40af; }
        .match-good-match-minor-edits { background: #fef3c7; color: #92400e; }
        .match-review { background: #f3f4f6; color: #4b5563; }
      `}</style>
    </>
  );
}
