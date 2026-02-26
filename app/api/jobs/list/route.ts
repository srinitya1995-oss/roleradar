import { NextResponse } from "next/server";
import { getJobsPayload } from "@/src/lib/jobs-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = getJobsPayload();
    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/jobs/list error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
