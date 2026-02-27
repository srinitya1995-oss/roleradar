import "dotenv/config";

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
 *   NOTIFY_EMAIL            - your email; agent emails you when new Apply now / Strong fit / top Near match jobs are found
 *   RESEND_API_KEY          - Resend API key (get one at resend.com); required for email
 *   NOTIFY_FROM             - optional "Name <email@domain.com>" (default: Role Radar <onboarding@resend.dev>)
 *   APP_BASE_URL            - optional base URL for "Open Inbox" link in email (e.g. https://yoursite.com)
 */

import * as fs from "fs";
import * as path from "path";
import { runPoll } from "./poll";
import { warmConnectionsForHighFitJobs } from "../src/lib/agent-warm";
import { canSendEmail, sendJobsNotification } from "../src/lib/notify-email";

const AGENT_HEARTBEAT_FILE =
  process.env.AGENT_HEARTBEAT_FILE ||
  path.resolve(process.cwd(), ".agent-last-poll");
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
  writeHeartbeat(); // so app shows "Agent: Live" as soon as agent starts
  console.log("RoleRadar agent started.");
  console.log(`  Wake interval: ${POLL_INTERVAL_MS / 60000} min (per-source poll is tier-based: 30min / 2hr / daily)`);
  console.log(`  Time window: ${ALWAYS_POLL ? "24/7" : `${WINDOW_START}:00–${WINDOW_END}:00 local`}`);
  console.log(`  Warm connections after poll: ${WARM_CONNECTIONS} (APPLY_NOW, STRONG_FIT, top NEAR_MATCH)`);
  if (!ALWAYS_POLL && !inWindow()) {
    console.log("Outside active window. Waiting until window starts…");
  }

  let firstWake = true;
  while (true) {
    if (inWindow()) {
      const now = new Date().toISOString();
      console.log(`[${now}] Running poll…`);
      try {
        const forceAll = firstWake;
        if (firstWake) {
          firstWake = false;
          console.log("  (First run: force poll all sources for fresh jobs.)");
        }
        const { count, inserted } = await runPoll(forceAll);
        writeHeartbeat();
        console.log(`  → ${count} new jobs inserted.`);

        const highFit = inserted.filter(
          (j) =>
            j.bucket === "APPLY_NOW" ||
            j.bucket === "STRONG_FIT" ||
            (j.bucket === "NEAR_MATCH" && (j.resume_match ?? 0) >= 88)
        );
        if (highFit.length > 0 && canSendEmail()) {
          const inboxUrl = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/inbox` : undefined;
          const { ok, error } = await sendJobsNotification(highFit, inboxUrl);
          if (ok) console.log(`  → Email sent: ${highFit.length} job(s) to NOTIFY_EMAIL.`);
          else console.warn(`  → Email failed:`, error);
        }

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
