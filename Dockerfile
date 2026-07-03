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

RUN npm run build

# =============================================================================
# Stage 5: runner  (default target)
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
