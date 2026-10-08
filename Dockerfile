# syntax=docker/dockerfile:1
#
# Build:  docker build -t tsm-portal-free-wifi .
# Run:    docker run -d --name tsm-portal-free-wifi --restart unless-stopped \
#           --env-file env.production.txt -p 3000:3000 tsm-portal-free-wifi
#
# Secrets (DB_*, DOC_ENC_KEY, DOC_HMAC_KEY, ...) are passed at runtime with
# --env-file and never baked into the image. The build does not need them.

# ---------------------------
# 1. Install dependencies
# ---------------------------
FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------------------------
# 2. Build
# ---------------------------
FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --bun: run the Next.js CLI on Bun instead of falling back to Node
RUN bun --bun run build

# ---------------------------
# 3. Runtime (Bun)
# ---------------------------
FROM oven/bun:1.4.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# lib/session.ts formats the RADIUS Expiration attribute in local time
ENV TZ=Asia/Bangkok

RUN apk add --no-cache tini tzdata

# Standalone output already bundles the node_modules it needs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "server.js"]
