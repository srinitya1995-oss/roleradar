# Role Radar — Final Flow (Checklist)

End-to-end flow with every step so you can verify behavior.

---

## 1. Setup (one-time)

| Step | Command / action | What happens |
|------|------------------|---------------|
| 1.1 | `npm run seed-top-companies` | Inserts/updates `job_sources`: Anthropic (greenhouse), Adobe (workday), Airbnb (greenhouse), Uber (greenhouse), OpenAI (ashby). Each row: company, url, parser, enabled=1, company_tier (1=30min, 2=2hr, 3=daily). |
| 1.2 | `npm run poll` (or agent does this) | For each **due** source (see 3.1), fetches jobs from URL via parser; for each **new** job (not in DB by source_id + external_id): applies location gate (locationEligible), title/description gate (passesTitleAndDescriptionGates); computes final_fit_score, resume_match, bucket; writes job row (and legacy cpi, tier). |
| 1.3 | `npm run dev` or `npm run dev:full` | Next.js app on http://127.0.0.1:3000. `dev:full` also starts the agent in the same terminal (concurrently). |
| 1.4 | (optional) `npm run seed-people` | Inserts people into `people`; job detail page uses these for "People to connect & ask for referral" (recommendations). |
| 1.5 | (optional) `OPENAI_API_KEY` in `.env` | Job detail and agent use LLM for referral targets when eligible; otherwise heuristic only. |

---

## 2. Poll — How jobs get into the DB

**Entry:** `scripts/poll.ts` → `runPoll()` (called by `npm run poll` or by the agent every wake).

| Step | Detail |
|------|--------|
| 2.1 | Load all enabled sources: `SELECT id, company, url, parser, company_tier, last_polled_at FROM job_sources WHERE enabled = 1`. |
| 2.2 | Filter to **due** sources: `sourceDue(source)` = (never polled) OR (last_polled_at + tier_interval has passed). Tier 1 → 30 min, Tier 2 → 2 hr, Tier 3 → 1 day. |
| 2.3 | For each due source: call parser (e.g. parseGreenhouseBoard(url)) → list of { title, url, location, external_id, description?, posted_at? }. |
| 2.4 | For each parsed job: if external_id already in DB for this source_id → skip. Else: |
| 2.5 | **Location:** `locationEligible(location, settings.allowed_locations, settings.allow_remote)`. Default: CA/Seattle allowed; remote-only excluded unless allow_remote. Skip if not eligible. |
| 2.6 | **Gates:** `passesTitleAndDescriptionGates(title, description, settings.allow_gpm)`. PM/PM-T/seniority; GPM only if allow_gpm. Skip if not pass. |
| 2.7 | **Scores:** `final_fit_score = computeFinalFitScore(title, description)` (0–100). `resume_match = profileMatchScore(title, description)` (0–100). `bucket = computeBucket(resume_match, final_fit_score)` → APPLY_NOW | STRONG_FIT | NEAR_MATCH | REVIEW | HIDE. |
| 2.8 | **Legacy:** `cpi = round(final_fit_score/10)`, `tier = Top 5% | Top 20% | Reject` (still written for back-compat). |
| 2.9 | **NEAR_MATCH:** If bucket === NEAR_MATCH and description present, `suggestions_json = generateSuggestionsForNearMatch(...)`. |
| 2.10 | INSERT into `jobs`: source_id, external_id, title, location, url, description, cpi, tier, posted_at, first_seen_at, last_seen_at, final_fit_score, resume_match, bucket, suggestions_json. Then `updateLastPolled.run(source.id)`. |

**Output:** `{ count, inserted[] }`. Inserted jobs are the new rows just added.

---

## 3. Inbox API — How the list is built

**Entry:** `GET /api/jobs/list` (and server-rendered Inbox page calls `getJobsPayload()` from `src/lib/jobs-api.ts`).

| Step | Detail |
|------|--------|
| 3.1 | **Recency:** `recency_days = getSettings().recency_days` (default 21). SQL: `(posted_at IS NOT NULL AND posted_at >= now - recency_days) OR (posted_at IS NULL AND first_seen_at >= now - recency_days)`. |
| 3.2 | **Query:** SELECT jobs + company from job_sources; ORDER BY posted_at/first_seen_at DESC, final_fit_score DESC, cpi DESC, id DESC. |
| 3.3 | **Dedupe:** By `(company.toLowerCase(), normalizeTitle(title))`; keep first occurrence. |
| 3.4 | **Location:** Filter with `locationEligible(location, allowed_locations, allow_remote)`. |
| 3.5 | **Bucket split:** effectiveBucket(row) from stored bucket or derived from resume_match/final_fit_score (legacy). Split into: apply_now (APPLY_NOW), strong_fit (STRONG_FIT), near_match (NEAR_MATCH), review (REVIEW), hide (HIDE). |
| 3.6 | **Connection status per job:** needConnectionsV2(bucket, final_fit_score). If false → connection_status = "n/a". Else: if no targets → "not_found"; if oldest target created_at < now - target_stale_days → "stale"; else "found". Load targets from job_referral_targets for all job ids. |
| 3.7 | **Payload:** top5 (= apply_now), top20 (= strong_fit), rejectedRelevantOnly (= near_match), reject (= review), other (= hide). Plus jobsByCompany for home page. Each job includes id, title, location, url, bucket, connection_status, match_pct, connection_targets (type_label, why_selected, confidence). |

**Inbox UI:** Renders sections in order: Apply now, Strong fit, Near match, Review, Hidden. Each section shows job cards (title, location, bucket badge, Copy connect note, Copy referral ask, Refresh targets if connection_status stale/not_found).

---

## 4. Job detail API — How one job + connections are loaded

**Entry:** `GET /api/jobs/[id]` (and optionally `?refresh_targets=1`).

| Step | Detail |
|------|--------|
| 4.1 | Load job by id from jobs + job_sources (company). 404 if not found. |
| 4.2 | **Eligible for connections:** `eligible = needConnectionsV2(job.bucket, final_fit_score)`. needConnectionsV2 = (final_fit_score >= 75) OR (bucket in APPLY_NOW, STRONG_FIT, NEAR_MATCH). |
| 4.3 | If query has `refresh_targets=1`: DELETE from job_referral_targets WHERE job_id = id. |
| 4.4 | **shouldAutoGenerate** = eligible OR refresh_targets. If false, referral_targets stay [], connection_status = "n/a" when !eligible. |
| 4.5 | If shouldAutoGenerate: (a) existingTargets = getReferralTargetsForJob(id). (b) If OPENAI_API_KEY set and (refresh_targets OR existingTargets.length === 0): call getReferralTargetsFromLLMV2; if payload.targets.length merge with heuristic and saveReferralTargets. (c) If still no targets: getOrCreateReferralTargetsForJob(id) → heuristic 4 slots (Recruiter, Hiring Manager, Team PM/Peer, High-Signal Connector), insert into job_referral_targets. (d) Re-query job_referral_targets for id, map to referral_targets array. |
| 4.6 | **connection_status:** If !eligible → "n/a". Else if referral_targets.length === 0 → "not_found". Else if oldest target created_at < now - target_stale_days → "stale". Else "found". |
| 4.7 | **Recommendations:** getRecommendationsForJob(id) from people pool (same company, Ex-Amazon, etc.), with drafted_message. |
| 4.8 | **Suggestions:** If job has suggestions_json (NEAR_MATCH), parse and return; else []. |
| 4.9 | Response: job (id, title, location, url, bucket, final_fit_score, resume_match, …), referral_targets, connection_status, eligible_for_connections, recommendations, suggestions. |

**Job page UI:** Shows job details, bucket, scores; "Find connections" section with 4 slots (search_url, why_selected, drafted_message). If no targets and eligible: "Find connections" button (calls same API with refresh_targets=1). Recommendations section from people. Suggestions section if NEAR_MATCH.

---

## 5. Agent loop — Poll + prewarm + email

**Entry:** `npm run agent` (or `npm run dev:full`). Process: `scripts/agent.ts`.

| Step | Detail |
|------|--------|
| 5.1 | **Config:** POLL_INTERVAL_MS (default 30 min), WINDOW_START/WINDOW_END (default 17–1), WARM_CONNECTIONS (default true), ALWAYS_POLL (default true = 24/7). |
| 5.2 | **Loop:** while (true). If !inWindow() (and !ALWAYS_POLL): sleep(CHECK_SLEEP_MS = 5 min); continue. |
| 5.3 | **Poll:** await runPoll(). Same as section 2. Write heartbeat: `.agent-last-poll` = now ISO. Log "→ count new jobs inserted." |
| 5.4 | **Email:** From inserted, highFit = APPLY_NOW or STRONG_FIT or (NEAR_MATCH and resume_match >= 88). If highFit.length > 0 and canSendEmail() (NOTIFY_EMAIL + RESEND_API_KEY): sendJobsNotification(highFit, inboxUrl). Log "→ Email sent: N job(s)". |
| 5.5 | **Prewarm:** If WARM_CONNECTIONS: warmConnectionsForHighFitJobs(). Gets jobs where bucket in (APPLY_NOW, STRONG_FIT, NEAR_MATCH with resume_match >= 88) AND no row in job_referral_targets; cap = settings.prewarm_cap (default 20). For each: warmConnectionsForJob(jobId) — LLM if OPENAI_API_KEY and (APPLY_NOW or STRONG_FIT with high score), else getOrCreateReferralTargetsForJob (heuristic). Log "→ Connections: warmed jobs warmed, failed skipped/failed." |
| 5.6 | **Sleep:** await sleep(POLL_INTERVAL_MS). Then repeat. |

**Inbox "Agent: Live":** App reads `.agent-last-poll` (via getAgentStatus / api/agent-status). If file exists and recent, show "Live" and "next update in X min".

---

## 6. Cadence summary

| What | When |
|------|------|
| Agent wake | Every POLL_INTERVAL_MS (default 30 min). |
| Per-source poll | Only when source is due: Tier 1 every 30 min, Tier 2 every 2 hr, Tier 3 daily. |
| Prewarm | After each poll run; only high-fit jobs with no targets yet; cap prewarm_cap. |
| Email | Once per poll run if new high-fit jobs and NOTIFY_EMAIL + RESEND_API_KEY set. |
| Inbox refresh | Page can refetch /api/jobs/list (e.g. every 60 s in InboxClient). |
| Job detail targets | On GET /api/jobs/[id]; auto-generate if eligible (or on refresh_targets=1). |

---

## 7. Settings (precedence: env > settings.json > defaults)

| Setting | Default | Effect |
|--------|--------|--------|
| recency_days | 21 | Inbox: only jobs with posted_at or first_seen_at in last N days. |
| allowed_locations | CA, Seattle, SF, LA, Bellevue, Redmond, … | locationEligible: job location must match or be remote (if allow_remote). |
| allow_remote | false | If false, remote-only postings excluded. |
| allow_gpm | false | If true, "Group Product Manager" passes title gate. |
| target_stale_days | 14 | connection_status "stale" if oldest target older than N days. |
| prewarm_cap | 20 | Max jobs to prewarm per agent run. |
| max_targets_per_job | 4 | Max referral target slots per job. |

Env vars: RECENCY_DAYS, ALLOW_REMOTE, ALLOW_GPM, TARGET_STALE_DAYS, PREWARM_CAP, ALLOWED_LOCATIONS (comma-separated).

---

## 8. Source of truth docs

- **Inbox + agent behavior:** [docs/INBOX_AND_AGENT_SPEC.md](INBOX_AND_AGENT_SPEC.md)
- **Connections (when need, slots, status, refresh):** [docs/CONNECTIONS_LOGIC_V2_SPEC.md](CONNECTIONS_LOGIC_V2_SPEC.md)
- **Scoring/buckets:** REQUIREMENTS.md §5 Legacy note; INBOX_AND_AGENT_SPEC bucket table.
