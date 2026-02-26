# Connections Logic (Referral Targets)

Connections are **referral outreach targets** for each job: Recruiter, Hiring Manager, and High-Signal Connector. They are stored in `job_referral_targets` and surfaced on the job page and in the dashboard Connections column.

---

## 1. When do we “need” connections?

- **Dashboard / API list:**  
  **Need connections** = CPI ≥ 5 (we look for and show connection status).  
  **Don’t need** = CPI &lt; 5 or CPI null → Connections column shows **N/A**.

- **Job detail page:**  
  Connections (Find connections) are shown for **every job**. Targets are created on demand (heuristic or LLM) when you open the page or click “Refresh targets”.

- **Agent:**  
  Only **high-fit** jobs get connections pre-warmed: Top 5%, Top 20%, or CPI ≥ 7, and only if they have **no** referral targets yet.

---

## 2. Connection status (dashboard column)

For each job in the list we set:

| `connection_status` | Meaning |
|----------------------|--------|
| **n/a** | CPI &lt; 5 or null → we don’t look for connections. |
| **not_found** | CPI ≥ 5 but no rows in `job_referral_targets` for this job (not created yet). |
| **found** | CPI ≥ 5 and at least one referral target exists; we show names (type labels) + `why_selected`. |

**Source:** `src/lib/jobs-api.ts` — `needConnections = r.cpi != null && r.cpi >= 5`, then `connection_status` and `connection_targets` from DB.

---

## 3. Where are targets created?

Two paths create or fill `job_referral_targets`:

1. **Job detail API** (`GET /api/jobs/[id]`) when you open a job page or use `?refresh_targets=1`.
2. **Agent** after each poll (`warmConnectionsForHighFitJobs`), for high-fit jobs that have no targets yet.

Both paths can use **heuristic** (always) and **LLM** (when enabled and conditions met).

---

## 4. Job detail API: GET /api/jobs/[id]

**Flow:**

1. Load existing targets: `getReferralTargetsForJob(id)`.
2. **LLM (optional):**  
   If `OPENAI_API_KEY` is set **and** (no existing targets **or** `?refresh_targets=1`):
   - Call `getReferralTargetsFromLLM(title, company, job_id, description)`.
   - If LLM returns ≥ 1 target → `saveReferralTargets(id, llmTargets)` (replaces existing).  
   On any error, we skip LLM and continue.
3. **Resolve targets:**  
   If there are targets in DB → use them.  
   Else → `getOrCreateReferralTargetsForJob(id)` (heuristic creates up to 3 and inserts them).
4. Return `referral_targets` (slot, target_type, search_url, why_selected, outreach_status, drafted_message).

So: **LLM first when allowed and no/refresh targets; otherwise or on failure, heuristic ensures every job can have up to 3 connections.**

---

## 5. Heuristic targets (`getOrCreateReferralTargetsForJob`)

**Source:** `src/lib/referral-targets.ts`

- Runs for **any job** (no CPI gate).
- If the job already has ≥ `max_targets_per_job` (capped at 3) targets, returns those.
- Otherwise gets job context (title, description, company) and builds **exactly 3** targets:

| Slot | Type | How it’s built |
|------|------|-----------------|
| 1 | **Recruiter** | If description has recruiter name (regex), search: `"{name} {company} LinkedIn"`. Else: `"{company} technical recruiter LinkedIn"`. `why_selected` explains which case. |
| 2 | **Hiring Manager** | If title/description mention a team/surface (GenAI, LLM, Product, Alexa, Rufus, etc.), search: `"{company} Principal Product Manager {team} LinkedIn"`. Else: `"{company} Principal Product Manager GenAI LinkedIn"`. |
| 3 | **High-Signal Connector** | Search: `"{company} ex Amazon Principal Product Manager LinkedIn"`. `why_selected`: ex-Amazon PM at company for referral/shared context. |

- Each target is a **Google search URL** (e.g. `https://www.google.com/search?q=...`). No scraping; user runs the search and finds LinkedIn.
- Inserts into `job_referral_targets` with `outreach_status = 'queued'` and a `drafted_message` (connect note template with job ID).
- **Recruiter name** is parsed with regexes for patterns like `recruiter: Name`, `talent acquisition: Name`, `contact: Name`, etc.
- **Team/surface** is the first match from: GenAI, Generative AI, AI, LLM, Conversational AI, Product, Alexa, Rufus (from title + description).

---

## 6. LLM targets (`getReferralTargetsFromLLM`)

**Source:** `src/lib/referral-llm.ts`

- **When:** Only if `OPENAI_API_KEY` is set. Used by job detail API (when no targets or refresh) and by agent (for Top 5% or CPI ≥ 8).
- **Input:** Job title, company, job_id, description (first 6000 chars).
- **Prompt:** System prompt = Referral Target Finder (see `src/lib/prompts.ts`) with optional candidate context (your profile: PM-T, Alexa GenAI, ex-Amazon, etc.). User prompt = job posting fields + instruction to return JSON with up to 3 targets: `recruiter`, `hiring_manager`, `high_signal_connector`, each with `search_query` and `why_selected`.
- **Model:** `gpt-4o-mini`.
- **Output:** Parsed JSON `targets[]`. Each target: `target_type`, `search_query`, `why_selected`. We build `search_url` from `search_query` (Google search); if "linkedin" not in query we append `" {company} LinkedIn"`. If LLM returns ≥ 1 valid target, caller uses them (e.g. `saveReferralTargets`), replacing existing targets for that job.
- **Failure:** On missing key, non-OK response, or parse error we return `[]`; caller then falls back to heuristic (job detail) or heuristic-only (agent).

---

## 7. Agent pre-warm (`warmConnectionsForHighFitJobs`)

**Source:** `src/lib/agent-warm.ts` + `scripts/agent.ts`

- After each poll, the agent calls `warmConnectionsForHighFitJobs()`.
- **Eligible jobs:** Top 5%, Top 20%, or CPI ≥ 7, and **no** row in `job_referral_targets` for that job (limit 50 per run).
- For each such job, **`warmConnectionsForJob(jobId)`**:
  - If the job already has targets → return true (nothing to do).
  - If **LLM allowed** (`OPENAI_API_KEY` set) **and** (tier = Top 5% **or** CPI ≥ 8):  
    Call `getReferralTargetsFromLLM`; if we get targets, `saveReferralTargets` and return true.
  - Else or on LLM failure:  
    `getOrCreateReferralTargetsForJob(jobId)` (heuristic). Return true if we got ≥ 1 target.

So the agent **only creates connections for high-fit jobs that don’t have any yet**, and prefers LLM for the very top (Top 5% or CPI ≥ 8).

---

## 8. Data model: `job_referral_targets`

- **job_id**, **slot** (1–3), **target_type** (recruiter | hiring_manager | high_signal_connector).
- **search_url** (Google search URL).
- **why_selected** (text shown in UI).
- **outreach_status**: `queued` | `sent` | `responded` (user can update on job page).
- **drafted_message** (connect note with job ID; user copies and pastes into LinkedIn).

Display names: Recruiter, Hiring Manager, High-Signal Connector.

---

## 9. Summary

| Question | Answer |
|----------|--------|
| When is connection status N/A? | CPI &lt; 5 or null (we don’t look for connections). |
| When is it “Not found”? | CPI ≥ 5 but no referral targets in DB yet. |
| When do we show names + why? | CPI ≥ 5 and at least one target in `job_referral_targets`. |
| Who creates targets? | Job detail API (on open or refresh); agent (after poll for high-fit jobs without targets). |
| Heuristic vs LLM? | Heuristic always builds 3 (recruiter, hiring manager, ex-Amazon connector). LLM used when key set and (no targets or refresh) on job page, or Top 5% / CPI ≥ 8 in agent; on LLM failure we use heuristic. |
| Where are targets stored? | Table `job_referral_targets`; list API joins to get `connection_status` and `connection_targets` (type_label + why_selected) for the dashboard. |
