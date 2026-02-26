# RoleRadar — Product Requirements (PRD-style)

## 1. Overview

**Product name:** RoleRadar  
**Summary:** A selective job-aggregation and fit-scoring system that helps a single user (Principal PM-T / GenAI profile) discover and prioritize roles, then generate referral-ready copy—with no automation of applications or outreach.

**Primary user:** One candidate (Srinitya), PM-T at Amazon Alexa AI, targeting Principal-level GenAI product roles.

---

## 2. Goals and Non-Goals

### Goals
- **Selective targeting:** Surface only roles that pass explicit fit gates (flagship, scope, CPI).
- **Principal GenAI focus:** Optimize for Principal-level, GenAI-relevant product roles.
- **Referral-first:** Support a referral-driven process (connect note → referral ask) with manual approval at every step.
- **Single source of truth:** One inbox with jobs tiered by fit (Top 5%, Top 20%, Reject).

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
| Discover relevant roles without noise | Ingest from configured job boards; score and tier so only CPI ≥ 7 is treated as “pursue.” |
| Decide what to pursue quickly | See at a glance: Top 5% (9–10), Top 20% (7–8), Reject (&lt;7). |
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

### 4.2 Fit scoring (CPI and gates)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-2.1 | The system SHALL compute a single fit score per job: CPI (Candidate–Role Fit Index) on a 0–10 scale. | Every stored job has a CPI value (or null if no description); score is derived from job description (and/or title) only. |
| FR-2.2 | CPI SHALL incorporate the following conceptual gates (implemented via signals/keywords or equivalent): (1) **Flagship surface** — ownership of customer-facing, end-to-end, shipped/scaled products; (2) **Scope jump** — 0-to-1, launch, new initiative signals; (3) **AI depth** — GenAI, LLM, ML, evaluation, safety, etc.; (4) **Technical fluency** — PM-T, roadmap, cross-functional, metrics; (5) **Business impact** — impact, revenue, customer, outcomes. | Scoring logic uses at least: flagship/customer-facing/ownership/0-to-1/launch/shipped/scale; GenAI/LLM/ML/evaluation; PM-T/product/roadmap/stakeholder; impact/revenue/customer. Exact keyword lists may be refined; the behavior is that higher presence of these signals yields higher CPI. |
| FR-2.3 | The system SHALL assign a tier per job from CPI: **Top 5%** (CPI 9–10), **Top 20%** (CPI 7–8), **Reject** (CPI &lt; 7). | Stored jobs have a tier field; UI and API expose jobs grouped by tier. |
| FR-2.4 | Jobs with no scoreable description MAY have null CPI and tier; the system SHALL still store and display them (e.g. in Reject or “Unscored”). | No crash or hide; such jobs appear in a defined section (e.g. Reject). |

### 4.3 Inbox and API

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-3.1 | The system SHALL expose a single “Inbox” view that lists jobs grouped by tier: Top 5%, Top 20%, Reject. | User sees three sections; each section shows job title (link to source), location, CPI if present, and actions. |
| FR-3.2 | The system SHALL provide an API (e.g. GET /api/jobs) that returns jobs grouped by tier (top5, top20, reject). | Response is JSON; client can render the same structure as the Inbox. |
| FR-3.3 | Within each tier, jobs SHALL be ordered by CPI descending, then by recency (e.g. id or created_at). | Order is deterministic and consistent between API and UI. |

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

## 5. Scoring Logic (CPI) — Detailed Behavior

- **Input:** Job title + job description (and optionally location); description may be empty.
- **Output:** Integer CPI in [0, 10] and tier label.
- **Method:** Keyword/signal-based scoring with weighted buckets (implementation may use exact keywords or normalized variants):
  - **Flagship surface:** e.g. flagship, customer-facing, end-to-end, owned, ownership, 0 to 1, zero to one, launch, shipped, scale, scaled.
  - **AI depth:** e.g. generative ai, genai, llm, large language, foundation model, reasoning, evaluation, safety, alignment, nlp, machine learning, ml, deep learning.
  - **Technical fluency:** e.g. pm-t, technical pm, engineering, product, roadmap, strategy, cross-functional, stakeholder, metrics, experimentation, a/b.
  - **Business impact:** e.g. impact, revenue, customer, growth, business, outcome.
- **Weights and caps:** Implementer may cap counts per bucket and apply weights so that the raw score maps to 0–10 (e.g. flagship capped and weighted, AI depth weighted higher, etc.).
- **Tier mapping:** 9–10 → Top 5%; 7–8 → Top 20%; &lt;7 → Reject. Null CPI → treat as Reject or “Unscored” for display.

---

## 6. Referral Copy — Content Requirements

- **Connect note:** Short (e.g. 1–2 sentences). Must include: candidate name/context (e.g. “Srinitya, PM-T at Amazon Alexa AI”), role context (“Principal GenAI role”), and **Job ID**. Tone: professional, concise. No auto-send.
- **Referral ask:** Used after connection. Must include: thanks for connecting, role + Job ID, brief value prop (e.g. 0-to-1 GenAI, reasoning/evaluation, shipped customer-facing AI), and a clear ask (“Would you be open to referring me?”). No auto-send.

---

## 7. Data Model (Logical)

- **job_sources:** id, company, url, parser, enabled.
- **jobs:** id, source_id, external_id, title, location, url, description (optional), cpi, tier, created_at.
- Persistence: SQLite (or equivalent) is acceptable; schema supports dedup by (source_id, external_id).

---

## 8. Non-Functional Requirements

| ID | Requirement | Notes |
|----|-------------|--------|
| NFR-1 | The system SHALL run locally (or in an environment the user controls). | No requirement to host in a specific cloud; local dev and single-user use are in scope. |
| NFR-2 | Poll and agent SHALL be runnable via CLI (e.g. npm scripts). | No requirement for a UI for adding sources or triggering poll; CLI is sufficient. |
| NFR-3 | Inbox SHALL be viewable in a browser (localhost or deployed). | One primary view: Inbox with tiered jobs and copy buttons. |
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

- User can add at least one job source (e.g. Greenhouse), run poll, and see jobs in the Inbox tiered by CPI.
- User can copy connect note and referral ask for any job and paste manually into LinkedIn.
- Optional: User can run an agent that polls on a schedule (default 24/7, every 30 min) without manual runs.
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
| `OPENAI_API_KEY` | — | If set, agent uses LLM for Top 5% connection targets. |
| `DATABASE_PATH` | `roleradar.db` | Path to SQLite DB. |

Full details and plist example: [docs/AGENT.md](docs/AGENT.md).

---

*This document is the product-manager-level specification for Role Radar. Implementation may use different keyword lists or weights as long as the behavior matches the acceptance criteria above.*
