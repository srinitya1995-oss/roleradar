import type { NextApiRequest, NextApiResponse } from "next";
import { getJobsPayload } from "@/src/lib/jobs-api";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (_req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const payload = getJobsPayload();
    res.status(200).json(payload);
  } catch (e) {
    console.error("GET /api/jobs error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
