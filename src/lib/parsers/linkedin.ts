/**
 * Fetch LinkedIn jobs via SerpApi Google Jobs API.
 * Requires SERPAPI_API_KEY in env. Filters results to via=LinkedIn only.
 * The "url" passed in is the search query (e.g. "Product Manager San Francisco").
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

type SerpApiJobResult = {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  description?: string;
  job_id?: string;
  link?: string;
  extensions?: string[];
  detected_extensions?: { posted_at?: string };
};

type SerpApiResponse = {
  jobs_results?: SerpApiJobResult[];
  error?: string;
};

export async function parseLinkedInJobs(searchQuery: string): Promise<ParsedJob[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.warn("SERPAPI_API_KEY not set; skipping LinkedIn jobs.");
    return [];
  }

  const params = new URLSearchParams({
    engine: "google_jobs",
    q: searchQuery.trim() || "Product Manager",
    api_key: apiKey.trim(),
  });

  const url = `https://serpapi.com/search?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new Error(`SerpApi HTTP ${res.status}`);
  }

  const data = (await res.json()) as SerpApiResponse;
  if (data.error) {
    throw new Error(data.error);
  }

  const jobs = data.jobs_results ?? [];
  const out: ParsedJob[] = [];

  for (const j of jobs) {
    const via = (j.via ?? "").toLowerCase();
    if (!via.includes("linkedin")) continue;

    const title = (j.title ?? "").trim();
    const link = (j.link ?? "").trim();
    const external_id = (j.job_id ?? link) || `${(j.company_name ?? "").trim()}|${title}`;
    const company = (j.company_name ?? "").trim() || undefined;
    const location = (j.location ?? "").trim();
    const description = (j.description ?? "").trim() || undefined;

    let posted_at: string | null = null;
    if (j.detected_extensions?.posted_at) {
      posted_at = j.detected_extensions.posted_at;
    } else if (Array.isArray(j.extensions) && j.extensions[0]) {
      posted_at = String(j.extensions[0]);
    }

    out.push({
      title: title || "Untitled",
      url: link || "#",
      location,
      external_id,
      description: description || undefined,
      posted_at: posted_at || null,
      company,
    });
  }

  if (jobs.length > 0) {
    console.warn(`LinkedIn/SerpApi: ${jobs.length} raw, ${out.length} included (via=LinkedIn or empty).`);
  }
  return out;
}
