# RoleRadar — Spec (Cursor alignment)

**Canonical scoring:** `final_fit_score` (0–100) + `resume_match` (0–100) → **bucket** (APPLY_NOW / STRONG_FIT / NEAR_MATCH / REVIEW / HIDE). CPI and tier are legacy back-compat.

**Source of truth docs:**
- **Full flow (setup → poll → inbox → job detail → agent):** [docs/FINAL_FLOW.md](docs/FINAL_FLOW.md)
- **Inbox + agent behavior:** [docs/INBOX_AND_AGENT_SPEC.md](docs/INBOX_AND_AGENT_SPEC.md)
- **Connections (4 slots, status, refresh):** [docs/CONNECTIONS_LOGIC_V2_SPEC.md](docs/CONNECTIONS_LOGIC_V2_SPEC.md)
- **Gates + scoring + buckets:** [docs/JOB_MATCHING_LOGIC.md](docs/JOB_MATCHING_LOGIC.md)

**Goals:** Selective Principal GenAI role targeting for Srinitya (PM-T). Referral-first; no auto-apply, no auto-send.

**Location:** CA (SF/Bay Area + LA) and Seattle only; out-of-area states blocked; Indeed company excluded.

**Inbox:** 7-day recency; sections Apply now, Strong fit, Near match, Review, Hidden, Interested (tracking_status). Columns: Job title, Posting, Company, Location, Posted, Resume match, Fit score, Connection, Tracking status.
