# Role Radar — Full walkthrough

**Quick start:** From project root run **`npm run setup`** (seeds sources + fetches jobs in one go). Optionally **`npm run seed-type4`** then **`npm run poll -- --force`** for Big Tech jobs (requires `SERPAPI_API_KEY`). Then **`npm run dev`** (or **`npm run dev:full`** for app + agent). Open **http://127.0.0.1:3000/inbox**. If you get 0 new jobs, set **`ALLOW_REMOTE=true`** in `.env` and run **`npm run poll`** again.

Step-by-step from clone to running app + agent + GitHub.

---

## Step 1: Clone and install

```bash
git clone https://github.com/srinitya1995-oss/roleradar.git
cd roleradar
npm install
```

---

## Step 2: Environment

Create a `.env` file in the project root (same folder as `package.json`). Optional; the app and agent work without it for basic use.

**Minimum (optional):**

```env
# Optional: SQLite DB path (default: roleradar.db in project root)
# DATABASE_PATH=./roleradar.db

# Optional: OpenAI for LLM-generated referral targets (Apply now / Strong fit)
# OPENAI_API_KEY=sk-...
# SERPAPI_API_KEY=...        # LinkedIn jobs via SerpApi Google Jobs
# RAPIDAPI_KEY=...           # JSearch (LinkedIn/Indeed/etc.) — subscribe at rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
# ADZUNA_APP_ID=...          # Adzuna job search (developer.adzuna.com/signup)
# ADZUNA_APP_KEY=...
```

**Agent (optional):**

```env
# Poll interval in ms (default: 30 min)
# AGENT_POLL_INTERVAL_MS=1800000

# false = poll only in time window (default window 5pm–1am); true = 24/7 (default)
# AGENT_ALWAYS_POLL=true

# Set to false to disable pre-warming referral targets after each poll
# AGENT_WARM_CONNECTIONS=true
```

Do **not** commit `.env`; it is in `.gitignore`.

---

## Step 3: Database and job sources

The app creates the SQLite DB and tables on first use. To seed job sources (companies + URLs + parsers):

```bash
npm run seed-top-companies
```

This adds/updates sources (e.g. Anthropic, Adobe, OpenAI, Uber). You can run `npm run seed-adobe`, `npm run seed-people`, etc. as needed (see `scripts/`). **Note:** `seed-people` and `seed-adobe` add **sample/demo contacts only** (names and LinkedIn URLs are not real). Replace with real people at your target companies for real "People to connect" recommendations.

**Backfill existing jobs (scores + bucket):** If you have existing job rows without `final_fit_score` / `resume_match` / `bucket`, run once:

```bash
npm run backfill:jobs
```

Optionally limit to last 60 days: `BACKFILL_DAYS=60 npm run backfill:jobs`.

**Job APIs (optional):** For LinkedIn and Adzuna job sources, set `SERPAPI_API_KEY` and/or `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` in `.env`. See [JOB_APIS.md](JOB_APIS.md).

**Settings:** Copy `settings.json.example` to `settings.json` to override defaults (recency_days, allow_remote, allowed_locations, etc.). Or set env vars: `RECENCY_DAYS`, `ALLOW_REMOTE`, `ALLOWED_LOCATIONS` (comma-separated), etc. See [INBOX_AND_AGENT_SPEC.md](INBOX_AND_AGENT_SPEC.md) — “How to configure settings”.

---

## Step 4: One-time poll (optional)

To fetch jobs once without running the agent:

```bash
npm run poll
```

New jobs are stored in `roleradar.db` with CPI and tier. If you skip this, the agent will fetch on its first run.

---

## Step 5: Run the app (Inbox UI)

Start the Next.js dev server (`npm run dev` uses `scripts/dev.sh` to avoid "too many open files" on macOS):

```bash
npm run dev
```

- Open **http://127.0.0.1:3000** for the dashboard (jobs by company). Click **→ Open Inbox** or go to **http://127.0.0.1:3000/inbox** for the bucketed Inbox (Apply now, Strong fit, Near match, Review, Hidden, Interested) and agent status.

Leave this terminal open while you use the app.

---

## Step 6: Run the agent (polling + connection warming)

The agent polls job sources every 30 minutes (default 24/7) and pre-warms referral targets for high-fit jobs.

**Option A — Foreground (terminal must stay open):**

```bash
npm run agent
```

You’ll see logs like: `Running poll…`, `X new jobs inserted`, `Connections: Y jobs warmed`. The Inbox will show **Agent: Live** and **next update in X min**.

**Option B — Background (keeps running after you close the terminal):**

```bash
nohup npm run agent > agent.log 2>&1 &
```

Logs go to `agent.log`. Process stops on reboot unless you use PM2 or launchd.

**Option C — PM2 (recommended for 24/7):**

```bash
npm install -g pm2
pm2 start npm --name roleradar-agent -- run agent
```

- View logs: `pm2 logs roleradar-agent`
- Restart: `pm2 restart roleradar-agent`
- Stop: `pm2 stop roleradar-agent`
- Restore after reboot: `pm2 save` then `pm2 startup` (run the command it prints)

**Option D — macOS launchd:**

See [AGENT.md](AGENT.md) for a plist that starts the agent at login.

---

## Step 7: Push to GitHub (after you’ve made changes)

If you cloned from GitHub and want to push commits:

1. **Create a Personal Access Token** (if you haven’t): GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic). Check the **repo** scope. Copy the token.

2. **Add remote** (only once; replace `USER` and `REPO` with your GitHub username and repo name):

   ```bash
   git remote add origin https://github.com/USER/REPO.git
   ```

   If `origin` already exists: `git remote set-url origin https://github.com/USER/REPO.git`

3. **Push:**

   ```bash
   git push -u origin main
   ```

   When prompted:
   - **Username:** your GitHub username  
   - **Password:** paste the **token** (not your GitHub password)

4. **Later pushes:** `git push`

Or use the script (replace URL with your repo):

```bash
./scripts/setup-github-remote.sh https://github.com/USER/REPO.git
```

Then run `git push -u origin main` in your terminal and enter credentials when asked.

---

## Summary checklist

| Step | What | Command / action |
|------|------|-------------------|
| 1 | Clone + install | `git clone ... && cd roleradar && npm install` |
| 2 | Env (optional) | Create `.env` with `OPENAI_API_KEY` etc. if needed |
| 3 | Seed sources | `npm run seed-top-companies`; optional: `npm run seed-type4` for Big Tech (needs SERPAPI_API_KEY) |
| 3b | Backfill jobs (if existing rows) | `npm run backfill:jobs` (or `BACKFILL_DAYS=60 npm run backfill:jobs`) |
| 4 | One-time poll (optional) | `npm run poll` (or `npm run poll -- --force` to poll all sources) |
| 5 | Run app | `npm run dev` → open http://127.0.0.1:3000/inbox |
| 6 | Run agent | `npm run agent` (or PM2 / nohup / launchd; see [AGENT.md](AGENT.md)) |
| 7 | Push to GitHub | Add remote, then `git push -u origin main` (use token as password) |

---

## Where things live

- **Inbox:** http://127.0.0.1:3000/inbox — jobs by bucket (Apply now, Strong fit, Near match, Review, Hidden, Interested), tracking status, agent status.
- **Dashboard:** http://127.0.0.1:3000 — jobs by company; link to Inbox.
- **Job detail:** http://localhost:3000/job/[id] — bucket + scores, 4 referral target slots, copy buttons, “Refresh targets”, suggestions (Near match).
- **Scoring fixture (dev):** `npm run test:scoring` — runs sample job descriptions and prints expected bucket + scores (local dev sanity check; not required for CI).
- **Agent status:** Shown on Inbox; or check `.agent-last-poll` file mtime (updated after each poll).
- **DB:** `roleradar.db` in project root (do not commit; in `.gitignore`).
- **Deploy (Docker, Railway, VPS):** [DEPLOY.md](DEPLOY.md).
- **Requirements / agent details:** [REQUIREMENTS.md](../REQUIREMENTS.md) (§ Running the agent), [AGENT.md](AGENT.md), [SYSTEM_AND_REQUIREMENTS.md](SYSTEM_AND_REQUIREMENTS.md).
