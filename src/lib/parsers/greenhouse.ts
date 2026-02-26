import axios from "axios";
import * as cheerio from "cheerio";

export type ParsedJob = {
  title: string;
  url: string;
  location: string;
  external_id: string;
  description?: string;
  posted_at?: string | null;
};

/**
 * Extract board token from Greenhouse board URL (e.g. anthropic from boards.greenhouse.io/anthropic).
 */
function getBoardToken(boardUrl: string): string {
  const u = new URL(boardUrl);
  const path = u.pathname.replace(/^\/+|\/+$/g, "");
  return path || u.hostname.split(".")[0];
}

/**
 * Fetches and parses a Greenhouse job board page using axios and cheerio.
 * Returns a list of jobs with title, url, location, and external_id.
 * Uses the public Greenhouse Job Board API when possible for reliability; falls back to HTML parsing.
 */
export async function parseGreenhouseBoard(boardUrl: string): Promise<ParsedJob[]> {
  const baseUrl = boardUrl.replace(/\/+$/, "");
  const boardToken = getBoardToken(boardUrl);

  // Prefer Greenhouse Job Board API (no auth required for listing jobs)
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`;
  try {
    const { data } = await axios.get<{ id: number; title: string; location: { name: string }; absolute_url: string; updated_at?: string }[]>(apiUrl, {
      timeout: 15000,
      headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
    });
    if (Array.isArray(data)) {
      return data.map((job) => ({
        title: job.title ?? "",
        url: job.absolute_url ?? `${baseUrl}/jobs/${job.id}`,
        location: job.location?.name ?? "",
        external_id: String(job.id),
        posted_at: job.updated_at ?? null,
      }));
    }
  } catch {
    // Fall through to HTML parsing
  }

  // Fallback: fetch HTML and parse with cheerio
  const { data: html } = await axios.get<string>(boardUrl, {
    timeout: 15000,
    headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
  });
  const $ = cheerio.load(html);
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  $('a[href*="/jobs/"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    const match = href.match(/\/jobs\/(\d+)/);
    if (!match) return;
    const external_id = match[1];
    if (seen.has(external_id)) return;
    seen.add(external_id);
    const url = href.startsWith("http") ? href : new URL(href, baseUrl).href;
    jobs.push({
      title: text,
      url,
      location: "",
      external_id,
    });
  });

  return jobs;
}
