/**
 * JSearch API (RapidAPI) — aggregates jobs from LinkedIn, Indeed, ZipRecruiter, etc.
 * Requires RAPIDAPI_KEY in env. Subscribe at https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 * The "url" passed in is the search query (e.g. "Product Manager").
 * No Claude/LLM needed; just REST.
 */

export type ParsedJob = {
  title: string;
  url: string;
  location: string;
  external_id: string;
  description?: string;
  posted_at?: string | null;
  company?: string;
};

type JSearchJob = {
  job_id?: string;
  employer_name?: string;
  job_title?: string;
  job_apply_link?: string;
  job_description?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;
};

type JSearchResponse = {
  data?: JSearchJob[];
  status?: string;
};

const DEFAULT_JSEARCH_HOST = "jsearch.p.rapidapi.com";

export async function parseJSearchJobs(searchQuery: string): Promise<ParsedJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    console.warn("RAPIDAPI_KEY not set; skipping JSearch jobs.");
    return [];
  }

  const host = process.env.RAPIDAPI_JSEARCH_HOST?.trim() || DEFAULT_JSEARCH_HOST;
  const query = encodeURIComponent((searchQuery || "Product Manager").trim());
  const url = `https://${host}/search?query=${query}&num_pages=1`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
    },
  });

  if (!res.ok) {
    throw new Error(`JSearch HTTP ${res.status}`);
  }

  const data = (await res.json()) as JSearchResponse & { data?: JSearchJob[] };
  const jobs = Array.isArray(data.data) ? data.data : [];
  const out: ParsedJob[] = [];

  for (const j of jobs) {
    const jobId = (j.job_id ?? "").trim();
    const title = (j.job_title ?? "").trim();
    const company = (j.employer_name ?? "").trim() || undefined;
    const parts = [j.job_city, j.job_state, j.job_country].filter(Boolean);
    const location = parts.join(", ") || "";
    const applyLink = (j.job_apply_link ?? "").trim();
    const description = (j.job_description ?? "").trim() || undefined;
    const postedAt = (j.job_posted_at_datetime_utc ?? "").trim() || null;

    out.push({
      title: title || "Untitled",
      url: applyLink || "#",
      location,
      external_id: jobId || `jsearch-${company ?? "unknown"}-${title}`.slice(0, 200),
      description: description || undefined,
      posted_at: postedAt || null,
      company,
    });
  }

  return out;
}
