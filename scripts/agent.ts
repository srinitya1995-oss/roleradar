/**
 * RoleRadar agent: runs poll on a schedule (optional time window), then pre-warms
 * referral connections for high-fit jobs so they're ready when you open the job page.
 *
 * Start: npm run agent
 * Leave running (e.g. in a terminal, or with PM2/launchd for production).
 *
 * Env (optional):
 *   AGENT_POLL_INTERVAL_MS   - minutes between polls when active (default 30)
 *   AGENT_WINDOW_START_HOUR  - start of active window, 0-23 (default 17 = 5pm)
 *   AGENT_WINDOW_END_HOUR    - end of active window, 0-23 (default 1 = 1am)
 *   AGENT_WARM_CONNECTIONS   - "true" to pre-warm connections after each poll (default true)
 *   AGENT_ALWAYS_POLL        - "true" to ignore time window and poll 24/7 (default false)
 */

import * as fs from "fs";
import * as path from "path";
import { runPoll } from "./poll";
import { warmConnectionsForHighFitJobs } from "../src/lib/agent-warm";

const AGENT_HEARTBEAT_FILE = path.join(process.cwd(), ".agent-last-poll");
function writeHeartbeat(): void {
  try {
    fs.writeFileSync(AGENT_HEARTBEAT_FILE, new Date().toISOString(), "utf8");
  } catch {
    // ignore
  }
}

const POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS) || 30 * 60 * 1000; // 30 min
const CHECK_SLEEP_MS = 5 * 60 * 1000; // when outside window, check every 5 min
const WINDOW_START = Number(process.env.AGENT_WINDOW_START_HOUR) || 17; // 5pm
const WINDOW_END = (() => {
  const n = Number(process.env.AGENT_WINDOW_END_HOUR);
  return Number.isFinite(n) ? n : 1;
})(); // 1am
const WARM_CONNECTIONS = process.env.AGENT_WARM_CONNECTIONS !== "false";
const ALWAYS_POLL = process.env.AGENT_ALWAYS_POLL !== "false"; // default: poll 24/7

/** True if current local time is in the active window (e.g. 5pm–1am). */
function inWindow(): boolean {
  if (ALWAYS_POLL) return true;
  const hour = new Date().getHours();
  if (WINDOW_START <= WINDOW_END) return hour >= WINDOW_START && hour < WINDOW_END;
  return hour >= WINDOW_START || hour < WINDOW_END;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("RoleRadar agent started.");
  console.log(`  Poll interval: ${POLL_INTERVAL_MS / 60000} min when active`);
  console.log(`  Time window: ${ALWAYS_POLL ? "24/7" : `${WINDOW_START}:00–${WINDOW_END}:00 local`}`);
  console.log(`  Warm connections after poll: ${WARM_CONNECTIONS}`);
  if (!ALWAYS_POLL && !inWindow()) {
    console.log("Outside active window. Waiting until window starts…");
  }

  while (true) {
    if (inWindow()) {
      const now = new Date().toISOString();
      console.log(`[${now}] Running poll…`);
      try {
        const inserted = await runPoll();
        writeHeartbeat();
        console.log(`  → ${inserted} new jobs inserted.`);

        if (WARM_CONNECTIONS) {
          const { warmed, failed } = await warmConnectionsForHighFitJobs();
          if (warmed > 0 || failed > 0) {
            console.log(`  → Connections: ${warmed} jobs warmed, ${failed} skipped/failed.`);
          }
        }
      } catch (e) {
        console.error("Poll failed:", e);
      }
      await sleep(POLL_INTERVAL_MS);
    } else {
      await sleep(CHECK_SLEEP_MS);
    }
  }
}

main();
