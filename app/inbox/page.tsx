import { getJobsPayload } from "@/src/lib/jobs-api";
import { getAgentStatus } from "@/src/lib/agent-status";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  let payload: { top5: unknown[]; top20: unknown[]; rejectedRelevantOnly: unknown[]; reject: unknown[]; other: unknown[]; interested: unknown[] };
  let agentStatus = { live: false, lastPollAt: null as string | null, pollIntervalMs: 30 * 60 * 1000 };

  try {
    payload = getJobsPayload();
  } catch (e) {
    console.error("Inbox getJobsPayload:", e);
    payload = { top5: [], top20: [], rejectedRelevantOnly: [], reject: [], other: [], interested: [] };
  }

  try {
    agentStatus = getAgentStatus();
  } catch (e) {
    console.error("Inbox getAgentStatus:", e);
  }

  const initialData = {
    top5: payload.top5 ?? [],
    top20: payload.top20 ?? [],
    rejectedRelevantOnly: payload.rejectedRelevantOnly ?? [],
    reject: payload.reject ?? [],
    other: payload.other ?? [],
    interested: payload.interested ?? [],
  };

  return (
    <InboxClient
      initialData={initialData}
      initialAgentStatus={agentStatus}
    />
  );
}
