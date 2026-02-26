# Connections Logic V2 — Referral Targets That Actually Help

**Canonical spec for when we need connections, connection status, target creation, slot types, data model, team/org extraction, heuristic + LLM target generation, UI, and refresh rules. Implemented: bucket-based needConnections, 4 slots, LLM + heuristic merge, Refresh CTA for stale/not_found.**

---

## SUMMARY OF CHANGES

- Replace CPI gating with **Fit gating**.
- Upgrade target generation to be **role-aware** (team/org extraction) + **platform-aware**.
- Store **richer target metadata** (not just Google URL).
- Add **outreach priority** + **confidence** + **source** so UI is reliable.
- Prewarm connections only for roles you'd realistically apply to.

---

## 1) WHEN DO WE "NEED" CONNECTIONS?

**OLD:** `needConnections = CPI != null && CPI >= 5`

**NEW:**
```
needConnections = (
  FINAL_FIT_SCORE >= 75
  OR bucket IN {APPLY_NOW, STRONG_FIT, NEAR_MATCH}
)
```

- **Dashboard/API list:** If needConnections true → show connection status + targets summary. Else → show N/A.
- **Job detail page:** Still allow "Find connections" for every job, but **default targets should only auto-create if needConnections true**. For low-fit jobs, only create targets when user clicks "Generate targets".
- **Agent:** Prewarm only for:
  - bucket == APPLY_NOW
  - OR bucket == STRONG_FIT
  - OR (bucket == NEAR_MATCH AND resume_match >= 88)
  (Implemented; cap per run from settings.prewarm_cap.)

---

## 2) CONNECTION STATUS (DASHBOARD COLUMN)

`connection_status` values:

| Value | Meaning |
|-------|--------|
| **n/a** | needConnections == false |
| **not_found** | needConnections == true AND no targets exist yet |
| **found** | needConnections == true AND >= 1 target exists |
| **stale** | needConnections == true AND targets older than 14 days OR job reposted/changed |
| **needs_refresh** | needConnections == true AND parsing indicates team/org changed |

**NOTE:** stale / needs_refresh should show "Refresh" CTA inline.

---

## 3) WHERE ARE TARGETS CREATED?

**A) Job detail API (GET /api/jobs/[id])**
- If needConnections true and no targets exist OR refresh_targets=1 → generate targets (LLM preferred, heuristic fallback).
- If needConnections false → do NOT auto-generate on page open. Only generate if user clicks "Generate targets".

**B) Agent prewarm (after poll)**
- Only for eligible buckets (see section 1).

---

## 4) TARGET TYPES (SLOTS) — MORE PRECISE

Replace fixed "Recruiter / Hiring Manager / ex-Amazon connector" with a **role-aware ladder**.

**Slots (max 4, not 3):**
1. **RECRUITER** — most reliable for response rate
2. **HIRING_MANAGER** — best signal when found
3. **TEAM_PM_OR_PEER** — same org / adjacent PM
4. **HIGH_SIGNAL_CONNECTOR** — shared background: Amazon/Alexa, same school, same city

If you can't find HM/team, fill with recruiter + peer + connector, but **never fabricate a name**.

---

## 5) DATA MODEL CHANGE (IMPORTANT)

Add columns to `job_referral_targets`:

| Column | Type | Notes |
|--------|------|--------|
| person_name | nullable | |
| title_guess | nullable | |
| linkedin_url | nullable | |
| source | enum | heuristic, llm, user_added |
| confidence | float 0–1 | |
| priority | int 1–5 | 1 is highest |
| created_at | | |
| refreshed_at | | |
| search_query | | store the raw query |
| search_url | | derived |
| why_selected | | shown in UI |
| outreach_status | enum | queued, sent, responded, ignored, not_applicable |

Keep **slot** but allow slot 1–4.

---

## 6) TEAM / ORG EXTRACTION (THE BIG FIX)

Before generating targets, extract **TEAM_CONTEXT** from the job.

**TEAM_CONTEXT fields:**
- org_keywords: Copilot, MAI, Applied AI, Personalization, GenAI, Agentic, etc.
- product_surface: checkout, marketplace, discovery, support, feed, assistant, etc.
- location_hub: Mountain View, SF, Seattle
- hiring_signals: "reports to", "work with", "team", "org", "our group"

**Extraction method:**
- Heuristic regex + keyword map (fast)
- LLM optional for higher accuracy (only for needConnections true)

**Store TEAM_CONTEXT in DB on job record** so it can be reused.

---

## 7) HEURISTIC TARGET GENERATION (UPGRADE)

Heuristic must generate **SEARCH QUERIES** that are tight + role-aware. No more generic "{company} technical recruiter".

**Slot 1: Recruiter**
- If JD contains recruiter/talent/contact name → query: `"{person_name} {company} recruiter LinkedIn"`
- Else (role-aware): `"{company} recruiter product manager {location_hub} LinkedIn"` OR `"{company} talent acquisition product {org_keywords} LinkedIn"`. Pick the one with highest specificity.

**Slot 2: Hiring Manager (role-aware)**
- Query: `"{company} hiring manager {job_title} {org_keywords} LinkedIn"`
- If team keywords exist: `"{company} {org_keywords} director product LinkedIn"`, `"{company} {org_keywords} group product manager LinkedIn"`. Use the most specific org keyword available.

**Slot 3: Team PM / Peer**
- Query: `"{company} product manager {org_keywords} LinkedIn"` or `"{company} product lead {org_keywords} LinkedIn"`. Prefer location_hub when present.

**Slot 4: High-Signal Connector (personalized)**  
Priority order:
- A) same company alumni from Amazon Alexa / Shopping
- B) same school alumni (Johns Hopkins Carey) at company
- C) same city hub (Seattle/SF/MV) PM at company

Query examples:
- "{company} Alexa product manager LinkedIn"
- "{company} Amazon product manager LinkedIn"
- "{company} Johns Hopkins Carey product manager LinkedIn"

Only use "ex Amazon" if nothing else.

Each target gets:
- confidence (heuristic default 0.55; recruiter regex name hit = 0.75)
- why_selected referencing TEAM_CONTEXT evidence

---

## 8) LLM TARGET GENERATION (UPGRADE PROMPT + SAFETY)

**LLM is used when:**
- needConnections true AND (no targets OR refresh_targets=1)
- agent prewarm for APPLY_NOW, STRONG_FIT>=82, NEAR_MATCH>=92

**LLM must return JSON targets with:**
- target_type
- search_query
- why_selected
- confidence (0–1)
- OPTIONAL: person_name_guess (only if explicitly in JD text)

**DO NOT hallucinate names not in JD.**

**LLM prompt must enforce:**
- prefer recruiter posts / talent partners
- prefer org-specific HM candidates based on extracted TEAM_CONTEXT
- include org keyword + location hub in search query
- avoid growth/games people if archetype flags drift risk

---

## 9) UI CHANGES (MAKE IT USEFUL)

**Dashboard Connections column:**
- Show 1–2 top targets only (priority 1–2)
- Show badge: Found / Not found / Stale
- Show "Refresh" inline for stale / needs_refresh

**Job detail page:**
- Display 4 slots with: type label, why_selected, confidence, and "Search" link
- Add "Copy outreach note" per target
- Add "Mark Sent/Responded" controls

---

## 10) REFRESH / STALENESS RULES

**Mark targets stale if:**
- targets.created_at older than 14 days
- OR job description hash changed
- OR job reposted and team keywords changed

**On stale:**
- do not overwrite user-edited targets unless refresh_targets=1
- generate new targets into "suggested_targets" and let user accept/replace

---

## 11) SUCCESS METRIC

Connections feature is successful if:
- For APPLY_NOW jobs, >= 80% have at least one recruiter target
- Average time-to-first-action (user clicks Search or copies note) < 30 seconds
- User hides "connections" less than 20% due to irrelevance

If users see generic Google queries with no clear relevance, the system has failed.
