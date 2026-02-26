# RoleRadar

Selective job aggregation and fit-scoring for Principal GenAI PM roles, with referral-ready copy and connection targets.

## Getting Started

### Dev server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port shown) for the dashboard. Jobs are grouped by company; click a role to see connections and referral copy.

### Agent (background job hunter)

The agent polls job sources on a schedule and pre-warms referral connections for high-fit jobs so they’re ready when you open a job page.

```bash
npm run agent
```

Leave it running in a terminal, or run it as a real service (see [docs/AGENT.md](docs/AGENT.md)):

- **PM2** (Node): `pm2 start npm --name roleradar-agent -- run agent`
- **launchd** (macOS): use the plist in `docs/AGENT.md`

Env (optional):

| Env | Default | Description |
|-----|---------|-------------|
| `AGENT_POLL_INTERVAL_MS` | 30 min | Minutes between polls when active |
| `AGENT_WINDOW_START_HOUR` | 17 | Start of active window (5pm) |
| `AGENT_WINDOW_END_HOUR` | 1 | End of active window (1am) |
| `AGENT_WARM_CONNECTIONS` | true | Pre-warm connections for Top 5% / Top 20% jobs after each poll |
| `AGENT_ALWAYS_POLL` | false | Set to `true` to poll 24/7 (ignore time window) |

### Other commands

- `npm run poll` — one-time poll of all enabled job sources
- `npm run rebuild-inbox` — clear jobs and referral targets, then poll
- `npm run seed-top-companies` — seed job sources (e.g. Anthropic, Adobe, OpenAI)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
