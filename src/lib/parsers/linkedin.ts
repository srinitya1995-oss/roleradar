/**
 * Fetch jobs via SerpApi Google Jobs API.
 * Requires SERPAPI_API_KEY in env.
 *
 * Include all relevant jobs: no filtering by source (LinkedIn, Indeed, company career sites, etc.).
 * Fetches up to 3 pages (≈30 jobs) per query via next_page_token so we don't miss results.
 * The "url" passed in is the search query (e.g. "Product Manager" or "Senior Product Manager Apple Intelligence Siri").
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
  serpapi_pagination?: { next_page_token?: string };
};

const MAX_PAGES = 3;
const TIMEOUT_MS = 20000;

function mapJobToParsed(j: SerpApiJobResult): ParsedJob {
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
  return {
    title: title || "Untitled",
    url: link || "#",
    location,
    external_id,
    description: description || undefined,
    posted_at: posted_at || null,
    company,
  };
}

export async function parseLinkedInJobs(searchQuery: string): Promise<ParsedJob[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.warn("SERPAPI_API_KEY not set; skipping LinkedIn jobs.");
    return [];
  }

  const q = searchQuery.trim() || "Product Manager";
  const out: ParsedJob[] = [];
  const seenIds = new Set<string>();
  let nextToken: string | undefined;
  let page = 0;

  while (page < MAX_PAGES) {
    const params = new URLSearchParams({
      engine: "google_jobs",
      q,
      api_key: apiKey.trim(),
    });
    if (nextToken) params.set("next_page_token", nextToken);

    const url = `https://serpapi.com/search?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`SerpApi HTTP ${res.status}`);
    }

    const data = (await res.json()) as SerpApiResponse;
    if (data.error) {
      if (
        data.error.toLowerCase().includes("hasn't returned any results") ||
        data.error.toLowerCase().includes("no results")
      ) {
        break;
      }
      throw new Error(data.error);
    }

    const jobs = data.jobs_results ?? [];
    for (const j of jobs) {
      const parsed = mapJobToParsed(j);
      if (seenIds.has(parsed.external_id)) continue;
      seenIds.add(parsed.external_id);
      out.push(parsed);
    }

    nextToken = data.serpapi_pagination?.next_page_token;
    if (!nextToken || jobs.length === 0) break;
    page++;
  }

  if (out.length > 0) {
    console.warn(`LinkedIn/SerpApi: ${out.length} jobs included (all relevant sources).`);
  }
  return out;
}
