/**
 * Fetch jobs from Adzuna (free API). Requires ADZUNA_APP_ID and ADZUNA_APP_KEY in env.
 * The "url" passed in is the search query (e.g. "Product Manager"). Country defaults to US.
 * Sign up: https://developer.adzuna.com/signup
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

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  description?: string;
  redirect_url?: string;
  created?: string;
};

type AdzunaResponse = {
  results?: AdzunaJob[];
};

const DEFAULT_COUNTRY = "us";

export async function parseAdzunaJobs(searchQuery: string): Promise<ParsedJob[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) {
    console.warn("ADZUNA_APP_ID or ADZUNA_APP_KEY not set; skipping Adzuna jobs.");
    return [];
  }

  const what = encodeURIComponent((searchQuery || "Product Manager").trim());
  const country = DEFAULT_COUNTRY;
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=50&what=${what}&content-type=application/json`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Adzuna HTTP ${res.status}`);
  }

  const data = (await res.json()) as AdzunaResponse;
  const results = data.results ?? [];
  const out: ParsedJob[] = [];

  for (const j of results) {
    const id = j.id ?? "";
    const title = (j.title ?? "").trim();
    const company = (j.company?.display_name ?? "").trim() || undefined;
    const location = j.location?.display_name ?? (Array.isArray(j.location?.area) ? j.location.area.join(", ") : "") ?? "";
    const description = (j.description ?? "").trim() || undefined;
    const redirect_url = (j.redirect_url ?? "").trim();
    const created = (j.created ?? "").trim() || null;

    out.push({
      title: title || "Untitled",
      url: redirect_url || "#",
      location,
      external_id: id || `adzuna-${company ?? "unknown"}-${title}`.slice(0, 200),
      description: description || undefined,
      posted_at: created || null,
      company,
    });
  }

  return out;
}
