import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const HEARTBEAT_FILE =
  process.env.AGENT_HEARTBEAT_FILE ||
  path.resolve(process.cwd(), ".agent-last-poll");
const FALLBACK_HEARTBEAT = path.resolve(process.cwd(), ".agent-last-poll");
const LIVE_THRESHOLD_MS = 120 * 60 * 1000; // 2 hr — so "Live" stays visible between polls
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min — match scripts/agent.ts default

function readHeartbeat(): { mtime: number; lastPollAt: string } | null {
  for (const file of [HEARTBEAT_FILE, FALLBACK_HEARTBEAT]) {
    try {
      const stat = fs.statSync(file);
      return { mtime: stat.mtime.getTime(), lastPollAt: stat.mtime.toISOString() };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET() {
  const h = readHeartbeat();
  if (!h) {
    return NextResponse.json({
      live: false,
      lastPollAt: null,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  }
  const now = Date.now();
  const live = now - h.mtime < LIVE_THRESHOLD_MS;
  return NextResponse.json({
    live,
    lastPollAt: h.lastPollAt,
    pollIntervalMs: POLL_INTERVAL_MS,
  });
}
