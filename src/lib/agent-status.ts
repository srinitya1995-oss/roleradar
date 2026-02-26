/**
 * Agent status for server-side use (e.g. Inbox initial load).
 * Same logic as app/api/agent-status/route.ts.
 */
import fs from "fs";
import path from "path";

const HEARTBEAT_FILE =
  process.env.AGENT_HEARTBEAT_FILE ||
  path.resolve(process.cwd(), ".agent-last-poll");
const FALLBACK_HEARTBEAT = path.resolve(process.cwd(), ".agent-last-poll");
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const LIVE_THRESHOLD_MS = 120 * 60 * 1000; // 2 hr

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

export function getAgentStatus(): {
  live: boolean;
  lastPollAt: string | null;
  pollIntervalMs: number;
} {
  const h = readHeartbeat();
  if (!h) return { live: false, lastPollAt: null, pollIntervalMs: POLL_INTERVAL_MS };
  const live = Date.now() - h.mtime < LIVE_THRESHOLD_MS;
  return { live, lastPollAt: h.lastPollAt, pollIntervalMs: POLL_INTERVAL_MS };
}
