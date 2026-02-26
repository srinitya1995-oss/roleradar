# Role Radar — Full walkthrough

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

# Optional: OpenAI for LLM-generated referral targets (Top 5% jobs)
# OPENAI_API_KEY=sk-...
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

This adds/updates sources (e.g. Anthropic, Adobe, OpenAI, Uber). You can run `npm run seed-adobe`, `npm run seed-people`, etc. as needed (see `scripts/`).

---

## Step 4: One-time poll (optional)

To fetch jobs once without running the agent:

```bash
npm run poll
```

New jobs are stored in `roleradar.db` with CPI and tier. If you skip this, the agent will fetch on its first run.

---

## Step 5: Run the app (Inbox UI)

Start the Next.js dev server:

```bash
npm run dev
```

- Open **http://localhost:3000** for the dashboard (jobs by company, last 7 days).
- Open **http://localhost:3000/inbox** for the tiered Inbox (Top 5%, Top 20%, Reject) and agent status.

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
| 3 | Seed sources | `npm run seed-top-companies` |
| 4 | One-time poll (optional) | `npm run poll` |
| 5 | Run app | `npm run dev` → open http://localhost:3000/inbox |
| 6 | Run agent | `npm run agent` (or PM2 / nohup / launchd; see [AGENT.md](AGENT.md)) |
| 7 | Push to GitHub | Add remote, then `git push -u origin main` (use token as password) |

---

## Where things live

- **Inbox:** http://localhost:3000/inbox — tiered jobs, agent status, “next update in X min”.
- **Dashboard:** http://localhost:3000 — jobs by company (last 7 days).
- **Job detail:** http://localhost:3000/job/[id] — referral targets, copy buttons, “From your network”.
- **Agent status:** Shown on Inbox; or check `.agent-last-poll` file mtime (updated after each poll).
- **DB:** `roleradar.db` in project root (do not commit; in `.gitignore`).
- **Requirements / agent details:** [REQUIREMENTS.md](../REQUIREMENTS.md) (§ Running the agent), [AGENT.md](AGENT.md), [SYSTEM_AND_REQUIREMENTS.md](SYSTEM_AND_REQUIREMENTS.md).
