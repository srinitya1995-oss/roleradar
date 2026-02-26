import axios from "axios";
import type { ParsedJob } from "./greenhouse";

/**
 * Extract job board name from Ashby URL (e.g. jobs.ashbyhq.com/Ashby -> Ashby, company.jobs.ashbyhq.com -> company).
 */
function getBoardName(boardUrl: string): string {
  const u = new URL(boardUrl);
  const path = u.pathname.replace(/^\/+|\/+$/g, "");
  if (path) return path;
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".jobs.ashbyhq.com")) return host.replace(".jobs.ashbyhq.com", "");
  if (host === "jobs.ashbyhq.com") return "Ashby";
  return host.split(".")[0] || "default";
}

type AshbyJob = {
  title?: string;
  location?: string;
  jobUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
};

export async function parseAshbyBoard(boardUrl: string): Promise<ParsedJob[]> {
  const boardName = getBoardName(boardUrl);
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}`;

  const { data } = await axios.get<{ jobs?: AshbyJob[] }>(apiUrl, {
    timeout: 15000,
    headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
  });

  const jobs = data?.jobs ?? [];
  return jobs
    .filter((j) => j.jobUrl || j.title)
    .map((job, index) => {
      const url = job.jobUrl ?? "";
      const external_id = url ? new URL(url).pathname.replace(/^\/+|\/+$/g, "") || `ashby-${index}` : `ashby-${index}`;
      return {
        title: job.title ?? "",
        url: url || boardUrl,
        location: job.location ?? "",
        external_id,
        description: job.descriptionPlain ?? job.descriptionHtml ?? undefined,
      };
    });
}
