import axios from "axios";
import type { ParsedJob } from "./greenhouse";

/**
 * Extract company identifier from SmartRecruiters careers URL (e.g. careers.smartrecruiters.com/companyId -> companyId).
 */
function getCompanyId(boardUrl: string): string {
  const u = new URL(boardUrl);
  const path = u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
  return path || u.hostname.split(".")[0];
}

type SmartRecruitersPosting = {
  id?: string;
  name?: string;
  location?: { city?: string; region?: string; country?: string };
  refNumber?: string;
  jobAd?: { sections?: { jobDescription?: { title?: string; text?: string } } };
  applyUrl?: string;
};

type SmartRecruitersResponse = {
  content?: SmartRecruitersPosting[];
  totalFound?: number;
};

export async function parseSmartRecruitersBoard(boardUrl: string): Promise<ParsedJob[]> {
  const companyId = getCompanyId(boardUrl);
  const apiUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=100`;

  const { data } = await axios.get<SmartRecruitersResponse>(apiUrl, {
    timeout: 15000,
    headers: { "User-Agent": "RoleRadar/1.0 (job-aggregator)" },
  });

  const content = data?.content ?? [];
  const locationStr = (p: SmartRecruitersPosting) => {
    const loc = p.location;
    if (!loc) return "";
    const parts = [loc.city, loc.region, loc.country].filter(Boolean);
    return parts.join(", ");
  };

  return content.map((job) => ({
    title: job.name ?? job.jobAd?.sections?.jobDescription?.title ?? "",
    url: job.applyUrl?.replace("/apply", "") ?? `https://jobs.smartrecruiters.com/${companyId}/${job.id}`,
    location: locationStr(job),
    external_id: job.id ?? job.refNumber ?? "",
    description: job.jobAd?.sections?.jobDescription?.text ?? undefined,
  }));
}
