/**
 * Agent status for server-side use (e.g. Inbox initial load).
 * Same logic as app/api/agent-status/route.ts.
 */
import fs from "fs";
import path from "path";

const HEARTBEAT_FILE =
  process.env.AGENT_HEARTBEAT_FILE ||
  path.resolve(process.cwd(), ".agent-last-poll");
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const LIVE_THRESHOLD_MS = 40 * 60 * 1000;

export function getAgentStatus(): {
  live: boolean;
  lastPollAt: string | null;
  pollIntervalMs: number;
} {
  try {
    const stat = fs.statSync(HEARTBEAT_FILE);
    const lastPollAt = stat.mtime.toISOString();
    const live = Date.now() - stat.mtime.getTime() < LIVE_THRESHOLD_MS;
    return { live, lastPollAt, pollIntervalMs: POLL_INTERVAL_MS };
  } catch {
    return { live: false, lastPollAt: null, pollIntervalMs: POLL_INTERVAL_MS };
  }
}
