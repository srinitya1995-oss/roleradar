import axios from "axios";
import * as cheerio from "cheerio";
import type { ParsedJob } from "./greenhouse";

/**
 * Workday career sites: https://{tenant}.wd{N}.myworkdayjobs.com/{site}
 * Try CXS POST endpoint first; fallback to HTML parsing of job links.
 */
function getWorkdayParams(boardUrl: string): { baseUrl: string; tenant: string; site: string } {
  const u = new URL(boardUrl);
  const baseUrl = u.origin;
  const pathParts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  const site = pathParts[0] || "external";
  const hostParts = u.hostname.split(".");
  const tenant = hostParts[0] ?? "unknown";
  return { baseUrl, tenant, site };
}

export async function parseWorkdayBoard(boardUrl: string): Promise<ParsedJob[]> {
  const { baseUrl, tenant, site } = getWorkdayParams(boardUrl);

  // Try CXS API (POST) - many Workday instances use this for job search
  const cxsUrl = `${baseUrl}/wday/cxs/${tenant}/${site}/jobs`;
  try {
    const { data } = await axios.post<{ jobPostings?: { id: string; title: string; locationsText?: string; externalUrl?: string }[] }>(
      cxsUrl,
      { appliedFacets: {}, limit: 20, offset: 0 },
      {
        timeout: 15000,
        headers: {
          "User-Agent": "RoleRadar/1.0 (job-aggregator)",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    const postings = data?.jobPostings ?? [];
    if (postings.length > 0) {
      return postings
        .map((job) => {
          const id = job.id ?? "";
          const externalUrl = job.externalUrl ?? (id ? `${baseUrl}/${site}/job/${id}` : null);
          if (!externalUrl || externalUrl.includes("undefined")) return null;
          const external_id = id || (() => {
            try {
              const segs = new URL(externalUrl).pathname.replace(/^\/+|\/+$/g, "").split("/");
              const jobIdx = segs.findIndex((p) => p.toLowerCase() === "job");
              return jobIdx >= 0 && segs[jobIdx + 1] != null ? segs[jobIdx + 1] : externalUrl;
            } catch {
              return externalUrl;
            }
          })();
          return {
            title: job.title ?? "",
            url: externalUrl,
            location: job.locationsText ?? "",
            external_id,
          };
        })
        .filter((j): j is NonNullable<typeof j> => j != null);
    }
  } catch {
    // Fall through to HTML
  }

  // Fallback: fetch HTML and parse job links (e.g. /job/... or /detail/...)
  const { data: html } = await axios.get<string>(boardUrl, {
    timeout: 15000,
    headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
  });

  const $ = cheerio.load(html);
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  $('a[href*="/job/"], a[href*="/detail/"], a[href*="/Job"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text || text.length > 200) return;
    const fullUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href;
    const path = new URL(fullUrl).pathname;
    const idMatch = path.match(/\/(?:job|detail|Job)\/([^/]+)/i) || path.match(/([a-f0-9-]{36})/i);
    const external_id = idMatch ? idMatch[1] : fullUrl;
    if (seen.has(external_id)) return;
    seen.add(external_id);
    jobs.push({
      title: text,
      url: fullUrl,
      location: "",
      external_id,
    });
  });

  return jobs;
}
