# Deploying to Railway

The app ships as a Docker image running the Next.js standalone server. Railway
builds the `Dockerfile`, runs pending Prisma migrations, then starts the server.

## What is already wired up

| Piece | Where | What it does |
| --- | --- | --- |
| Image | `Dockerfile` | Multi-stage build; runtime image has no build tooling and runs as a non-root user |
| Build + start | `railway.json` | `prisma migrate deploy && node server.js` |
| Healthcheck | `/api/health` | Verifies a real database round-trip, not just process liveness |
| Schema | `prisma/migrations/` | Includes `pg_trgm` and the trigram index |
| Config guard | `src/lib/env.ts` | Refuses to boot on a missing or placeholder secret |

## One-time setup

### 1. Create the project and database

```bash
npm i -g @railway/cli
railway login
railway init                     # or: railway link  (existing project)
railway add --database postgres
```

Railway injects `DATABASE_URL` into the service automatically once Postgres is
attached. Confirm it appears under the service's Variables tab before deploying.

### 2. Set the remaining variables

```bash
railway variables --set "AUTH_SECRET=$(openssl rand -base64 32)"
railway variables --set "AI_PROVIDER=deterministic"
```

`AUTH_SECRET` signs every session cookie. Generate it with the command above —
do not reuse the value from `.env`, and do not invent one by hand. Changing it
later signs everyone out, which is the intended way to revoke all sessions.

To enable AI-assisted suggestions instead of the deterministic provider:

```bash
railway variables --set "AI_PROVIDER=openai"
railway variables --set "OPENAI_API_KEY=sk-..."
railway variables --set "OPENAI_MODEL=gpt-4o-mini"
```

The app will refuse to start if `AI_PROVIDER=openai` without a key, rather than
failing the first time someone opens the wizard.

### 3. Deploy

```bash
railway up
railway domain          # generates a public URL
```

The first deploy runs the initial migration against the empty database, which
creates every table, enables `pg_trgm`, and builds the trigram index.

## Verifying a deploy

```bash
curl https://<your-domain>/api/health
# {"status":"ok","database":"reachable"}
```

A `503` with `"database":"unreachable"` means the service is up but cannot reach
Postgres — check that the database is attached and `DATABASE_URL` is present.

Then create the first account at `/sign-in` using **Create account**. The first
person to register is a normal user; they become an `OWNER` of whichever
organization they create, and can invite the rest of the team from the
**People** page.

## Migrations on later deploys

Add a migration locally, commit it, and deploy — `railway.json` applies pending
migrations before the new version starts serving:

```bash
npm run prisma:migrate -- --name add_something
git add prisma/migrations && git commit -m "Add something"
railway up
```

`prisma migrate deploy` never resets or drops data. If a migration fails, the
release stops before the new server takes traffic and the previous version keeps
running.

## Operational notes

- **Scaling**: sessions are stateless signed cookies, so multiple replicas work
  with no shared session store. Postgres connection count is the limit to watch;
  Prisma pools per instance.
- **Rotating the signing secret**: change `AUTH_SECRET` to invalidate every
  session immediately. Everyone signs in again; no data is affected.
- **Backups**: enable them on the Railway Postgres service. Nothing in the app
  layer holds state that is not in the database.
- **Cost**: the deterministic AI provider costs nothing. `AI_PROVIDER=openai`
  bills per suggestion request against your own key.

## Things deliberately left out

- **Email**: no provider is wired up, so invitations produce a copyable link
  rather than sending mail. Adding Resend later turns that into a real send
  without changing the invitation model.
- **Password reset**: needs email delivery, so it follows the same dependency.
- **Email verification**: the `emailVerifiedAt` column already exists so this can
  be switched on without a migration.
