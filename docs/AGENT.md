# Running the RoleRadar agent as a real service

The agent polls job sources on a schedule and pre-warms referral connections for high-fit jobs. To run it 24/7 (or within a time window) as a background service, use one of the options below.

## Option 1: PM2 (Node process manager)

Install PM2 globally (one-time):

```bash
npm install -g pm2
```

From the project root (where `package.json` and `roleradar.db` live), start the agent:

```bash
cd /path/to/roleradar
pm2 start npm --name roleradar-agent -- run agent
```

Use the same env the app needs (e.g. `.env` in the project root). PM2 will inherit the current shell’s env when you run `pm2 start`; for a persistent env, use `pm2 start npm --name roleradar-agent -- run agent --env production` and set env in `ecosystem.config.js`, or run from a directory that has `.env` and PM2 will run the process with that cwd.

Useful commands:

- `pm2 status` — list processes
- `pm2 logs roleradar-agent` — view logs
- `pm2 stop roleradar-agent` / `pm2 restart roleradar-agent`
- `pm2 save` then `pm2 startup` — restore agent on reboot

## Option 2: launchd (macOS)

Create a plist so the agent runs as a user LaunchAgent (runs when you’re logged in, stops when you log out).

1. Create the plist file:

```bash
mkdir -p ~/Library/LaunchAgents
```

2. Save the following as `~/Library/LaunchAgents/com.roleradar.agent.plist` (replace `YOUR_USERNAME` and `/path/to/roleradar` with your macOS username and the real path to the project):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.roleradar.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>tsx</string>
    <string>scripts/agent.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/roleradar</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/roleradar-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/roleradar-agent.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

If you use a project-local Node (e.g. via nvm), set `ProgramArguments` to the full path to `node` and pass the script, e.g.:

```xml
<key>ProgramArguments</key>
<array>
  <string>/Users/YOUR_USERNAME/.nvm/versions/node/v20.x.x/bin/node</string>
  <string>/Users/YOUR_USERNAME/.nvm/versions/node/v20.x.x/bin/npx</string>
  <string>tsx</string>
  <string>scripts/agent.ts</string>
</array>
```

3. Load and start the agent:

```bash
launchctl load ~/Library/LaunchAgents/com.roleradar.agent.plist
```

4. To stop or unload:

```bash
launchctl stop com.roleradar.agent
launchctl unload ~/Library/LaunchAgents/com.roleradar.agent.plist
```

Logs: `tail -f /tmp/roleradar-agent.log` and `/tmp/roleradar-agent.err`.

## Option 3: Terminal in background

For a quick “real agent” without installing anything:

```bash
cd /path/to/roleradar
nohup npm run agent > agent.log 2>&1 &
```

Logs go to `agent.log`. The process will stop when the machine reboots unless you add it to cron or a service manager.

## Env vars

Set these in `.env` in the project root (or in the process manager’s env) so both the app and the agent see them:

- `OPENAI_API_KEY` — optional; when set, the agent uses the LLM to pre-warm connections for Top 5% jobs.
- `DATABASE_PATH` — optional; path to SQLite DB (default `roleradar.db` in project root).
- `AGENT_POLL_INTERVAL_MS` — optional; interval between polls in ms (default 30 min).
- `AGENT_ALWAYS_POLL` — default is `true` (poll 24/7). Set to `false` to poll only during the time window (e.g. 5pm–1am local).
- `AGENT_WARM_CONNECTIONS` — set to `false` to disable pre-warming connections after each poll.

## What the agent does each cycle

1. **Poll** — Fetches enabled job sources, runs gates and CPI, inserts new jobs.
2. **Warm connections** (if `AGENT_WARM_CONNECTIONS` is not `false`) — Finds high-fit jobs (Top 5%, Top 20%, or CPI ≥ 7) that have no referral targets yet, and creates them (heuristic search links; for Top 5%, also calls the LLM when `OPENAI_API_KEY` is set).

So when you open a job page, “Find connections” is already populated for new high-fit roles.
