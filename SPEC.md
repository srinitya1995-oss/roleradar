# RoleRadar

**Canonical scoring is V2:** `final_fit_score` (0–100) + `resume_match` (0–100) → **bucket** (APPLY_NOW / STRONG_FIT / NEAR_MATCH / REVIEW / HIDE). CPI and tier (Top 5% / Top 20% / Reject) are **legacy / back-compat**. Source of truth: [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md), [docs/CONNECTIONS_LOGIC_V2_SPEC.md](docs/CONNECTIONS_LOGIC_V2_SPEC.md).

---

Goal:
Selective Principal GenAI role targeting system for Srinitya (PM-T, Amazon Alexa AI).

Non-goals:
- No auto apply
- No email scraping
- No auto sending messages
- LinkedIn only for outreach
- Referral first

Core gates:
1. Flagship surface test
2. Scope jump test
3. CPI scoring (0-10) — **LEGACY**; canonical is V2 bucket.

**LEGACY CPI tiers** (still written for back-compat):
9-10: Top 5%
7-8: Top 20%
<7: Reject

Referral workflow (canonical: bucket in APPLY_NOW / STRONG_FIT / top NEAR_MATCH or needConnectionsV2):
If CPI >= 7 (LEGACY) or bucket high-fit:
- Generate LinkedIn connect note (Job ID only)
- Generate referral ask (after connect)
- Always require manual approval

Job-finder agent + scoring + UI:
- Full spec: docs/JOB_AGENT_SPEC.md (archetypes, FINAL_FIT_SCORE, buckets APPLY NOW / STRONG FIT / NEAR MATCH / REVIEW / HIDE, UI grouping by role family, resume phrase bank, flow ownership).
- Current CPI/Top5/Top20/Shortlist/Reject is legacy; migrate to that spec.

Job source fetching:
- Full spec: docs/JOB_SOURCE_FETCHING_V2_SPEC.md (company tiers 1–3, polling 30min/2hr/daily, Greenhouse/Ashby/Workday/Custom Enterprise headless discovery, title pre-filtering, posted_date ≤ 21 days, company enrichment, success metric >70% Tier 1).
- Current poll/seed is legacy; migrate to that spec.

Connections (referral targets):
- Full spec: docs/CONNECTIONS_LOGIC_V2_SPEC.md (Fit gating, 4 slots RECRUITER/HIRING_MANAGER/TEAM_PM_OR_PEER/HIGH_SIGNAL_CONNECTOR, TEAM_CONTEXT extraction, heuristic + LLM role-aware queries, data model + priority/confidence/source, connection_status stale/needs_refresh, UI + Refresh CTA, success metric).
- Current CPI gating + 3 slots is legacy; migrate to that spec.

This file keeps Cursor aligned with your philosophy.
