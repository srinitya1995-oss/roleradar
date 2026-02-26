# RoleRadar — Product Requirements (PRD-style)

## 1. Overview

**Product name:** RoleRadar  
**Summary:** A selective job-aggregation and fit-scoring system that helps a single user (Principal PM-T / GenAI profile) discover and prioritize roles, then generate referral-ready copy—with no automation of applications or outreach.

**Primary user:** One candidate (Srinitya), PM-T at Amazon Alexa AI, targeting Principal-level GenAI product roles.

---

## 2. Goals and Non-Goals

### Goals
- **Selective targeting:** Surface only roles that pass explicit fit gates (PM title, seniority, location, description sanity).
- **Principal GenAI focus:** Optimize for Principal-level, GenAI-relevant product roles.
- **Referral-first:** Support a referral-driven process (connect note → referral ask) with manual approval at every step.
- **Single source of truth:** One inbox with jobs bucketed by fit: **Apply now**, **Strong fit**, **Near match**, **Review**, **Hidden** (see [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md)).

### Non-Goals (Explicit Out of Scope)
- **No auto-apply:** The system must never submit applications on the user’s behalf.
- **No email scraping:** No ingestion or parsing of the user’s email for jobs or contacts.
- **No auto-sending:** No automated DMs, connection requests, or messages; all outreach is copy-only and user-initiated.
- **LinkedIn only for outreach:** LinkedIn is the sole channel for which we generate outreach copy; we do not send or post there automatically.
- **No other outreach channels:** No automation or copy generation for email, Twitter, etc., unless explicitly added later.

---

## 3. User Persona and Jobs to Be Done

**Persona:** Srinitya — PM-T, Amazon Alexa AI, targeting Principal GenAI roles.

| Job to be done | How RoleRadar helps |
|----------------|----------------------|
| Discover relevant roles without noise | Ingest from configured job boards; score and bucket so only high-fit (Apply now / Strong fit / top Near match) is treated as “pursue.” |
| Decide what to pursue quickly | See at a glance: **Apply now**, **Strong fit**, **Near match**, **Review**, **Hidden** (ordered by final_fit_score then recency). |
| Reach out in a referral-first way | One-tap copy for “connect note” and “referral ask” with Job ID; user pastes and sends manually. |
| Run a lightweight “hunt” on a schedule | Optional agent runs during a configurable window (e.g. 5pm–1am), polling sources on an interval. |

---

## 4. Functional Requirements

### 4.1 Job sources and ingestion

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-1.1 | The system SHALL support one or more job sources (company + URL + parser). | Admin/seed can add sources; each has company name, URL, parser type, enabled flag. |
| FR-1.2 | The system SHALL support at least one parser type (e.g. Greenhouse). | Poll runs without error for each enabled source using its designated parser. |
| FR-1.3 | The system SHALL fetch job listings from each enabled source on demand (e.g. via a “poll” command). | After poll, new jobs appear in the database with title, location, URL, external_id, and optional description. |
| FR-1.4 | The system SHALL deduplicate jobs per source by external_id. | Re-running poll does not create duplicate rows for the same job at the same source. |
| FR-1.5 | (Optional) The system SHALL support a scheduled “agent” that runs poll on an interval (default 24/7; optional time window e.g. 5pm–1am local). | When the agent is run, it polls every 30 min by default (24/7); see [Running the agent](#running-the-agent) and [docs/AGENT.md](docs/AGENT.md). |

### 4.2 Fit scoring (V2: final_fit_score, resume_match, bucket)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-2.1 | The system SHALL compute per job: **final_fit_score** (0–100) from Role Relevance + AI Depth + Domain Fit − Penalties, and **resume_match** (0–100) from profile keywords/surfaces. | Stored jobs have final_fit_score, resume_match; scoring is deterministic (see [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md)). |
| FR-2.2 | The system SHALL assign a **bucket** per job: **APPLY_NOW** (resume ≥95, fit ≥85), **STRONG_FIT** (resume 90–94, fit ≥80), **NEAR_MATCH** (resume 80–89, fit ≥70), **REVIEW** (resume 70–79), **HIDE** (else). | Stored jobs have a bucket field; UI and API expose jobs grouped by bucket. |
| FR-2.3 | Gates (title/seniority/location/description) SHALL run before scoring; only jobs that pass gates are scored and bucketed. | Poll and API apply gates; failed jobs are not stored or appear in Hidden. |
| FR-2.4 | Jobs with no scoreable description MAY have bucket HIDE (or REVIEW if title strongly passes PM gates); the system SHALL still store and display them in the appropriate section. | No crash; such jobs appear in Hidden or Review. |

### 4.3 Inbox and API

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-3.1 | The system SHALL expose a single “Inbox” view that lists jobs grouped by bucket: **Apply now**, **Strong fit**, **Near match**, **Review**, **Hidden**. | User sees five sections (order above); each section shows job title (link to source), location, bucket, and actions. |
| FR-3.2 | The system SHALL provide an API (e.g. GET /api/jobs/list) that returns jobs grouped by bucket (top5=apply_now, top20=strong_fit, rejectedRelevantOnly=near_match, reject=review, other=hidden). | Response is JSON; client can render the same structure as the Inbox. |
| FR-3.3 | Within each bucket, jobs SHALL be ordered by final_fit_score descending, then by recency (posted_at or first_seen_at). | Order is deterministic and consistent between API and UI. |

### 4.4 Referral workflow (copy only, manual approval)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-4.1 | For each job, the system SHALL support generating two text snippets: (1) **Connect note** — short LinkedIn connection request message that includes only the Job ID (no auto-send). (2) **Referral ask** — follow-up message after connection, referencing the role and Job ID, asking for a referral (no auto-send). | Copy is generated using a fixed template parameterized by recruiter/hiring contact name (or placeholder) and Job ID. |
| FR-4.2 | Connect note and referral ask SHALL be one-tap (or one-click) copy to clipboard. | User can paste into LinkedIn (or elsewhere) manually; no integration with LinkedIn. |
| FR-4.3 | The system SHALL NOT send any message, connection request, or application on behalf of the user. | No API or automation to LinkedIn or email; all “sending” is done by the user. |
| FR-4.4 | Copy SHALL be generated only for display/copy; the system SHALL always require manual approval (user decides whether to paste and send). | No “Send” button that triggers an external send; only “Copy” (or equivalent). |

### 4.5 Configuration and operations

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-5.1 | Job sources SHALL be configurable (add/disable) without code change where possible (e.g. DB or config). | Seed script or admin flow can add a new company/URL/parser; poll uses only enabled sources. |
| FR-5.2 | The "agent" SHALL poll at a defined interval (default every 30 min) and SHALL support 24/7 (default) or a time window (e.g. 5pm–1am). | Configurable via env (default 24/7); see [Running the agent](#running-the-agent) and [docs/AGENT.md](docs/AGENT.md). |

---

## 5. Scoring Logic (V2) — Canonical Behavior

- **Input:** Job title + job description (and optionally location); description may be empty.
- **Output:** **final_fit_score** (0–100), **resume_match** (0–100), **bucket** (APPLY_NOW | STRONG_FIT | NEAR_MATCH | REVIEW | HIDE).
- **Method:** See [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md) and `src/lib/scoring.ts` (Role Relevance 0–40, AI Depth 0–30, Domain Fit 0–20, Penalties 0–30); resume_match from profile keywords/surfaces.
- **Bucket rules:** APPLY_NOW (resume ≥95, fit ≥85); STRONG_FIT (resume 90–94, fit ≥80); NEAR_MATCH (resume 80–89, fit ≥70); REVIEW (resume 70–79); HIDE (else).
- **Recency:** Jobs included only if (posted_at OR first_seen_at) within recency_days (default 21). **Location:** CA + Seattle allowed; remote-only excluded unless allow_remote.

---

## 6. Referral Copy — Content Requirements

- **Connect note:** Short (e.g. 1–2 sentences). Must include: candidate name/context (e.g. “Srinitya, PM-T at Amazon Alexa AI”), role context (“Principal GenAI role”), and **Job ID**. Tone: professional, concise. No auto-send.
- **Referral ask:** Used after connection. Must include: thanks for connecting, role + Job ID, brief value prop (e.g. 0-to-1 GenAI, reasoning/evaluation, shipped customer-facing AI), and a clear ask (“Would you be open to referring me?”). No auto-send.

---

## 7. Data Model (Logical)

- **job_sources:** id, company, url, parser, enabled, company_tier, last_polled_at.
- **jobs:** id, source_id, external_id, title, location, url, description (optional), created_at, posted_at, first_seen_at, last_seen_at, **final_fit_score**, **resume_match**, **bucket**, suggestions_json; cpi/tier retained for legacy back-compat.
- Persistence: SQLite; schema supports dedup by (source_id, external_id).

---

## 8. Non-Functional Requirements

| ID | Requirement | Notes |
|----|-------------|--------|
| NFR-1 | The system SHALL run locally (or in an environment the user controls). | No requirement to host in a specific cloud; local dev and single-user use are in scope. |
| NFR-2 | Poll and agent SHALL be runnable via CLI (e.g. npm scripts). | No requirement for a UI for adding sources or triggering poll; CLI is sufficient. |
| NFR-3 | Inbox SHALL be viewable in a browser (localhost or deployed). | One primary view: Inbox with bucketed jobs (Apply now, Strong fit, Near match, Review, Hidden) and copy buttons. |
| NFR-4 | No PII SHALL be scraped or stored beyond what the user explicitly provides (e.g. name in templates). | No email/calendar scraping; job data is from public job boards only. |

---

## 9. Out of Scope (Summary)

- Auto-apply to jobs.
- Email or calendar scraping.
- Any automated sending of messages or connection requests.
- LinkedIn (or any channel) API integration for sending.
- Multi-user or tenant support.
- Official “support” for non-Greenhouse boards until explicitly added (can be extended later with new parsers).

---

## 10. Success Criteria

- User can add at least one job source (e.g. Greenhouse), run poll (and optionally `npm run backfill:jobs`), and see jobs in the Inbox bucketed (Apply now, Strong fit, Near match, Review, Hidden).
- User can copy connect note and referral ask for any job and paste manually into LinkedIn.
- Optional: User can run an agent that polls on a schedule (wake interval default 30 min; per-source poll is tier-based 30min/2hr/daily) without manual runs.
- No automatic applications or messages are ever sent by the system.

---

## Running the agent

**Full step-by-step (clone through push):** [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)

The agent polls job sources on an interval and pre-warms referral connections for high-fit jobs. **Default: 24/7, every 30 minutes.**

### Quick start (terminal)

From the project root:

```bash
npm run agent
```

Leave the terminal open; the agent runs until you stop it (Ctrl+C). The app Inbox (http://localhost:3000/inbox) shows **Agent: Live** and **next update in X min** when the agent is running.

### Run as a background service (keeps running after you close the terminal)

- **PM2 (recommended):** `npm install -g pm2` then `pm2 start npm --name roleradar-agent -- run agent`. Commands: `pm2 logs roleradar-agent`, `pm2 restart roleradar-agent`, `pm2 stop roleradar-agent`.
- **macOS launchd:** See [docs/AGENT.md](docs/AGENT.md) for a plist that starts the agent at login.
- **One-off background:** `nohup npm run agent > agent.log 2>&1 &` (stops on reboot unless you use PM2/launchd).

### Env (optional)

| Env | Default | Description |
|-----|---------|-------------|
| `AGENT_POLL_INTERVAL_MS` | 30 min | Time between polls when active. |
| `AGENT_ALWAYS_POLL` | `true` (24/7) | Set to `false` to poll only in time window (e.g. 5pm–1am). |
| `AGENT_WINDOW_START_HOUR` | 17 | Start hour when not 24/7 (0–23). |
| `AGENT_WINDOW_END_HOUR` | 1 | End hour when not 24/7 (0–23). |
| `AGENT_WARM_CONNECTIONS` | `true` | Set to `false` to skip pre-warming referral targets after each poll. |
| `OPENAI_API_KEY` | — | If set, agent uses LLM for Apply now / Strong fit connection targets. |
| `DATABASE_PATH` | `roleradar.db` | Path to SQLite DB. |
| `NOTIFY_EMAIL` | — | Your email; agent emails you when new **Apply now**, **Strong fit**, or top **Near match** jobs are found. |
| `RESEND_API_KEY` | — | [Resend](https://resend.com) API key (get one at resend.com/api-keys); required for email. |
| `NOTIFY_FROM` | Role Radar &lt;onboarding@resend.dev&gt; | Optional sender (use a verified domain for production). |
| `APP_BASE_URL` | — | Optional base URL for the "Open Inbox" link in the email (e.g. https://yoursite.com). |

Full details and plist example: [docs/AGENT.md](docs/AGENT.md).

### Email when jobs fit

If you set **NOTIFY_EMAIL** (your personal email) and **RESEND_API_KEY**, the agent will send you one email per poll run when it finds **new** jobs in **Apply now**, **Strong fit**, or top **Near match** (resume_match ≥ 88). The email lists title, company, location, bucket, fit/resume scores, and links to each job and to the Inbox. No email is sent if no new high-fit jobs were inserted that run.

---

## Legacy note

**CPI and tier** (Top 5%, Top 20%, Reject) are still written by the poll for backward compatibility; **canonical behavior is V2**: **final_fit_score**, **resume_match**, and **bucket** (APPLY_NOW / STRONG_FIT / NEAR_MATCH / REVIEW / HIDE). Source of truth for current behavior:

- [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md) — Inbox sections, recency, location, bucket rules, settings, agent.
- [docs/CONNECTIONS_LOGIC_V2_SPEC.md](docs/CONNECTIONS_LOGIC_V2_SPEC.md) — When we need connections, 4 slots, connection_status, Refresh, prewarm.

---

*This document is the product-manager-level specification for Role Radar. V2 scoring and buckets are canonical; CPI/tier is legacy/back-compat.*
