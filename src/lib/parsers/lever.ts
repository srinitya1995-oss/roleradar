import axios from "axios";
import type { ParsedJob } from "./greenhouse";

/**
 * Extract site name from Lever job board URL (e.g. lever from jobs.lever.co/lever).
 * Supports jobs.lever.co/SITE and jobs.eu.lever.co/SITE.
 */
function getSiteFromUrl(boardUrl: string): string {
  const u = new URL(boardUrl);
  const path = u.pathname.replace(/^\/+|\/+$/g, "");
  return path || u.hostname.split(".")[0];
}

/** EU instance: jobs.eu.lever.co -> api.eu.lever.co */
function getApiBase(boardUrl: string): string {
  const u = new URL(boardUrl);
  return u.hostname.includes("eu.lever") ? "https://api.eu.lever.co" : "https://api.lever.co";
}

export async function parseLeverBoard(boardUrl: string): Promise<ParsedJob[]> {
  const site = getSiteFromUrl(boardUrl);
  const base = getApiBase(boardUrl);
  const apiUrl = `${base}/v0/postings/${site}?mode=json&limit=100`;

  const { data } = await axios.get<{ id: string; text: string; categories?: { location?: string }; hostedUrl?: string; descriptionPlain?: string }[]>(apiUrl, {
    timeout: 15000,
    headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)", Accept: "application/json" },
  });

  if (!Array.isArray(data)) return [];

  return data.map((job) => ({
    title: job.text ?? "",
    url: job.hostedUrl ?? `${boardUrl.replace(/\/?$/, "")}/${job.id}`,
    location: job.categories?.location ?? "",
    external_id: job.id ?? "",
    description: job.descriptionPlain ?? undefined,
  }));
}
