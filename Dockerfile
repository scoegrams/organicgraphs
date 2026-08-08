# Multi-stage build for the Next.js standalone server.
#
# Stage layout keeps the runtime image small and free of build tooling:
#   deps    - install node_modules once, cached on the lockfile alone
#   builder - generate the Prisma client and compile the app
#   runner  - copy only the traced output, plus what migrations need
#
# Debian slim (not Alpine) because Prisma's engines link against glibc.

FROM node:22-slim AS base
# OpenSSL is a Prisma engine runtime dependency.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Full install (including postinstall) so Prisma engines and sharp land correctly.
# embedded-postgres pulls a Linux binary into this build stage only — it is not
# copied into the runtime image.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci

# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next standalone expects a public/ directory even when it is empty.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# The build only inspects the schema; it never connects. A syntactically valid
# placeholder keeps Prisma happy without baking a real credential into a layer.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at release time, so the schema, migration SQL, and the Prisma
# CLI have to exist in the runtime image. Invoke via node (not .bin) so a
# broken symlink cannot take down the start command.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
