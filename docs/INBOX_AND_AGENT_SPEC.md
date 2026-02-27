# Inbox & Agent — Canonical Spec

**Implemented behavior:** Bucket-based Inbox (Apply now / Strong fit / Near match / Review / Hidden), recency and location policy, scoring and prewarm by bucket.

---

## Agent

- **What it does:** Runs poll on a **wake interval** (default 30 min). Each wake, only **due** sources are polled (tier-based: Tier 1 every 30 min, Tier 2 every 2 hr, Tier 3 daily). Optionally pre-warms referral targets for APPLY_NOW, STRONG_FIT, and top NEAR_MATCH (resume_match ≥ 88).
- **Start:** `npm run agent` (leave running in a terminal or run as a service).
- **Stop:** Kill the process (e.g. Ctrl+C, or `pkill -f "scripts/agent"`).
- **Config (env):** `AGENT_POLL_INTERVAL_MS` (wake interval), `AGENT_WINDOW_START_HOUR`, `AGENT_WINDOW_END_HOUR`, `AGENT_WARM_CONNECTIONS`, `AGENT_ALWAYS_POLL`, `NOTIFY_EMAIL`, `RESEND_API_KEY`, `APP_BASE_URL`.

### Wake interval vs per-source poll

- **Wake interval:** How often the agent loop runs (e.g. 30 min). Each wake it calls `runPoll()`.
- **Per-source poll:** Only sources that are **due** are fetched. Due = `last_polled_at + tier_interval` has passed. Tier 1 = 30 min, Tier 2 = 2 hr, Tier 3 = daily. So not every source is polled every wake.

---

## Inbox — Section Order and Rules

**Display order (top to bottom):**

1. **Apply now** (bucket APPLY_NOW)
2. **Strong fit** (bucket STRONG_FIT)
3. **Near match** (bucket NEAR_MATCH)
4. **Review** (bucket REVIEW)
5. **Hidden** (bucket HIDE)
6. **Interested** (jobs with non-empty tracking_status: Asked for referral, Applied, Interviewing, Declined)

**Data scope:** List API uses **7 days** recency (hardcoded in jobs-api). Jobs deduped by (company, normalized title). Only jobs that pass the **location policy** and are not company **Indeed** are included.

**Recency:** Single rule: `(posted_at IS NOT NULL AND posted_at >= now - recency_days) OR (posted_at IS NULL AND first_seen_at >= now - recency_days)`. Configurable via `recency_days` (default 21).

**Location policy:** Job is included only if **locationEligible**: (location matches an allowed city/state) OR (remote-only and `allow_remote` is true). Default: **CA + Seattle metro** allowed; **remote-only roles excluded** (`allow_remote` false). Hybrid tied to an allowed city is OK.

---

### Bucket definitions (source of truth)

Buckets are stored on the job row (`bucket`) and computed at ingest from **resume_match** (0–100) and **final_fit_score** (0–100):

| Bucket       | Rule |
|-------------|------|
| **APPLY_NOW**  | resume_match ≥ 95 AND final_fit_score ≥ 85 |
| **STRONG_FIT** | resume_match 90–94 AND final_fit_score ≥ 80 |
| **NEAR_MATCH** | resume_match 80–89 AND final_fit_score ≥ 70 |
| **REVIEW**     | resume_match 70–79 |
| **HIDE**       | &lt; 70 or fails gates |

Legacy rows without `bucket`/`resume_match`/`final_fit_score` get an effective bucket derived from tier/CPI/profile match in the API.

---

### Settings that affect Inbox / Agent

| Setting | Default | Effect |
|--------|--------|--------|
| `recency_days` | 21 | Include only jobs with (posted_at OR first_seen_at) in last N days. |
| `allowed_locations` | CA, Seattle, SF, LA, Bellevue, Redmond, … | Location must match (substring) or be remote-only when allow_remote true. |
| `allow_remote` | false | If false, remote-only roles (e.g. "Remote", "Remote - US") are excluded. |
| `allow_gpm` | false | If true, "Group Product Manager" passes title gate. |
| `target_stale_days` | 14 | Targets older than this show connection_status "stale" and Refresh CTA. |
| `prewarm_cap` | 20 | Max jobs to prewarm per agent run. |

---

## How to configure settings

**Precedence:** env vars &gt; `settings.json` (repo root) &gt; code defaults.

- **Env:** Set `RECENCY_DAYS`, `ALLOW_REMOTE` (true/false), `ALLOW_GPM`, `TARGET_STALE_DAYS`, `PREWARM_CAP`, `MAX_TARGETS_PER_JOB`. For `ALLOWED_LOCATIONS` use a comma-separated list (e.g. `CA,Seattle,SF`).
- **File:** Copy `settings.json.example` to `settings.json` and edit. Keys: `recency_days`, `allow_remote`, `allow_gpm`, `target_stale_days`, `prewarm_cap`, `max_targets_per_job`, `allowed_locations` (array).
- **Defaults:** CA + Seattle metro in `allowed_locations`; remote-only excluded (`allow_remote` false). See `src/lib/settings.ts` for all defaults.

---

## Run live agent (macOS)

- **Option 1 — Terminal:** `npm run agent` (leave running).
- **Option 2 — PM2:** `npx pm2 start npm --name "roleradar-agent" -- run agent`; logs: `pm2 logs roleradar-agent`; restart: `pm2 restart roleradar-agent`.
- **Option 3 — launchd:** Add a plist that runs `npm run agent`; logs go to a file or stdout/stderr as configured.

Logs: stdout of the Node process. Heartbeat file: `.agent-last-poll` in project root (last poll timestamp).
