# Role Radar — app + agent. Mount a volume for roleradar.db and set .env (or env vars).
FROM node:20-alpine AS base
WORKDIR /app

# Install deps (include devDependencies for tsx/agent build)
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build Next.js
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production runner: app + agent
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/app ./app
COPY --from=builder /app/pages ./pages

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Agent in background, then Next.js in foreground. DB path: use volume or DATABASE_PATH.
CMD npm run agent & exec npm run start
