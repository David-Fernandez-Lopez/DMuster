# =============================================================================
# Stage 1: base
# Common foundation for all stages. Defines the Node.js version and workdir.
# =============================================================================
ARG NODE_VERSION=22-slim

FROM node:${NODE_VERSION} AS base
WORKDIR /app

# =============================================================================
# Stage 2: dependencies
# Installs production + dev dependencies with npm ci for reproducible builds.
# BuildKit cache mounts keep the npm cache across rebuilds.
# =============================================================================
FROM base AS dependencies

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# =============================================================================
# Stage 3: dev
# Development server with hot-reload. Source code is NOT copied here; it is
# mounted as a bind volume by docker-compose so changes are reflected
# immediately without rebuilding the image.
# =============================================================================
FROM base AS dev

COPY --from=dependencies /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "run", "dev"]

# =============================================================================
# Stage 4: builder
# Compiles the Next.js application in standalone mode for production.
# =============================================================================
FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# The builder has no runtime secrets (DATABASE_URL, AUTH_SECRET, ...); skip
# env validation here and let it run for real when the container starts.
ENV SKIP_ENV_VALIDATION=1
# `next build` evaluates route modules, and src/lib/prisma.ts parses
# DATABASE_URL when imported. A syntactically valid placeholder is enough: the
# MariaDB adapter only connects on the first query, which the build never runs.
# Builder-stage ENV does not carry over to the runner image.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"

# The Prisma client (src/generated/) is gitignored, so a clean checkout — which
# is what a CI/Coolify build starts from — does not have it. Generate it before
# compiling; `prisma generate` does not connect to the database.
RUN npx prisma generate && npm run build

# =============================================================================
# Stage 5: migrator
# One-shot container run before the app on every deploy: applies pending
# migrations (`prisma migrate deploy`) and, when SEED_USER_EMAIL is set, tries
# the bootstrap seed. Keeps the Prisma CLI and dev dependencies out of the
# runner image.
# =============================================================================
FROM base AS migrator

# The Prisma schema engine (migrate) needs libssl, which the slim image lacks.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# The seed imports from src/ (generated client, shared validation), so bring
# the builder's copy, which already includes the generated client.
COPY --from=builder /app/src ./src
COPY docker/migrate/entrypoint.sh /usr/local/bin/dmuster-migrate

CMD ["sh", "/usr/local/bin/dmuster-migrate"]

# =============================================================================
# Stage 6: cron
# Fires the CRON_SECRET-protected /api/cron/* routes on a schedule. The script
# is baked into the image so the production stack needs no bind mounts.
# =============================================================================
FROM alpine:3.22 AS cron

COPY docker/cron/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]

# =============================================================================
# Stage 7: runner  (default target — must stay the last stage)
# Minimal production image. Copies only the standalone bundle, static assets,
# and public folder. Runs as non-root user for security.
# =============================================================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Allow the Node.js server to write the prerender cache at runtime
RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
