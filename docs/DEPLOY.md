# Deploy Role Radar and run the agent

The app uses a **local SQLite DB** (`roleradar.db`), so deployment needs a **single machine or container** where both the Next.js app and the agent run and share the same DB file.

---

## Where and how to run

**Where:** In a terminal on your Mac (Terminal.app, iTerm, or Cursor’s integrated terminal: **Terminal → New Terminal**).

**How:**

1. Open a terminal.
2. Go to the project folder:
   ```bash
   cd /Users/srinityaduppanapudisatya/Desktop/roleradar
   ```
3. **Docker (one command):**
   ```bash
   ./scripts/docker-run.sh
   ```
   Or run the steps yourself (see Option 1 below).
4. **Without Docker (dev + agent):**
   ```bash
   npm run dev
   ```
   In a **second** terminal (same folder):
   ```bash
   npm run agent
   ```
   Then open http://localhost:3000/inbox.

**Docker must be installed and running** (e.g. [Docker Desktop](https://www.docker.com/products/docker-desktop/)). You need a `.env` file in the project root for `docker run --env-file .env`.

---

## Option 1: Docker (app + agent in one container)

From the project root:

```bash
./scripts/docker-run.sh
```

Or manually:

```bash
docker build -t roleradar .
docker run -p 3000:3000 -v "$(pwd)/roleradar.db:/app/roleradar.db" --env-file .env roleradar
```

- **Volume:** Mount `roleradar.db` (and optionally `.env`) so the DB and env persist. If the DB doesn’t exist, the app creates it on first run.
- **Port:** App is on http://localhost:3000. Agent runs inside the same container and polls every 30 min (default).
- **Env:** Use `--env-file .env` or pass `-e OPENAI_API_KEY=...` etc. as needed.

To run in the background:

```bash
docker run -d -p 3000:3000 -v "$(pwd)/roleradar.db:/app/roleradar.db" --env-file .env --name roleradar roleradar
docker logs -f roleradar
```

## Option 2: Railway / Render / Fly.io (or any host with a volume)

1. Connect the repo and set **build** to use the Dockerfile (or use their Node build and run `npm run build` then `npm run agent & npm run start`).
2. Add a **persistent volume** and set it as the working directory or set `DATABASE_PATH` to the path of the DB file on the volume (e.g. `/data/roleradar.db`).
3. Set env vars (e.g. `OPENAI_API_KEY`, `SERPAPI_API_KEY`, `AGENT_POLL_INTERVAL_MS`).
4. Start command: run both app and agent (e.g. `npm run agent & npm run start` or use the same CMD as in the Dockerfile).

## Option 3: VPS (e.g. Ubuntu)

```bash
cd /path/to/roleradar
npm ci && npm run build
# Run app (e.g. with PM2)
pm2 start npm --name roleradar-app -- run start
# Run agent
pm2 start npm --name roleradar-agent -- run agent
pm2 save && pm2 startup
```

Use the same `.env` and `roleradar.db` path for both processes.

## Agent status in the UI

The Inbox shows **Agent: Live** when the app can read the agent heartbeat file (`.agent-last-poll`). If you run the app and agent in **different environments** (e.g. app on Vercel, agent on a VM), set `AGENT_HEARTBEAT_FILE` to a shared path or URL your app can read; otherwise run app and agent on the same host/container so they share the filesystem.
