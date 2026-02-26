import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const HEARTBEAT_FILE =
  process.env.AGENT_HEARTBEAT_FILE ||
  path.resolve(process.cwd(), ".agent-last-poll");
const LIVE_THRESHOLD_MS = 40 * 60 * 1000; // 40 min (poll every 30)
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min — match scripts/agent.ts default

export async function GET() {
  try {
    const stat = fs.statSync(HEARTBEAT_FILE);
    const mtime = stat.mtime.getTime();
    const now = Date.now();
    const lastPollAt = stat.mtime.toISOString();
    const live = now - mtime < LIVE_THRESHOLD_MS;
    return NextResponse.json({
      live,
      lastPollAt,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  } catch {
    return NextResponse.json({
      live: false,
      lastPollAt: null,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  }
}
