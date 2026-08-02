# OrgGraphs

> Temporary working name — branding is isolated in `src/lib/brand.ts` so it can be renamed in one place.

OrgGraph is an AI-assisted organizational operating system. A guided setup wizard interviews a company in plain language, then **recommends a complete operating model** (record types, relationships, permission groups, workflows, dashboards, and automated health checks). The customer reviews it visually, edits it, approves it, and generates a functioning workspace.

This repository currently implements **Milestone 1 — the runnable spine**, built and verified end to end:

Sign in → create organization → choose an industry pack → complete the conversational wizard → review a recommendation **with counts computed from real data** → edit and approve it → **transactionally generate** the workspace schema → land on the generated workspace.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript (strict)**
- **Tailwind CSS** with an accessible shadcn-style component set
- **PostgreSQL** via **Prisma ORM**
- **Zod** for all input and AI-output validation
- Provider-abstracted intelligence: a **deterministic local provider** (default, no key) and an **OpenAI provider** (structured output, strict Zod validation, deterministic fallback)
- **Vitest** (unit + DB integration) and **Playwright** (end-to-end)

### Local database with no Docker or sudo

This machine had no Docker/Homebrew/Postgres, so local dev uses **`embedded-postgres`**, which runs a *real* PostgreSQL 17 server from `node_modules` (data in `./.pgdata`). A `docker-compose.yml` is also provided for anyone who prefers Docker.

## Prerequisites

- **Node.js 20+** (built and tested on Node 24 LTS). If you don't have it: download the macOS arm64 tarball from nodejs.org and add its `bin` to your `PATH`.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # defaults work out of the box (deterministic AI, embedded PG on :55432)

# 3. Start the local Postgres (real server, daemonized, survives the shell)
npm run db:start

# 4. Create the database schema
npx prisma db push

# 5. Run the app
npm run dev                 # predev auto-ensures the DB is up
# open http://localhost:3000
```

To enable the OpenAI-backed provider, set in `.env`:

```
AI_PROVIDER="openai"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"
```

With no key (or `AI_PROVIDER=deterministic`), the app is fully functional using deterministic templates and industry packs.

### Database commands

```bash
npm run db:start   # init (first run) + start the daemon
npm run db:stop    # stop it
npm run db:reset   # wipe ./.pgdata and re-init
```

Prefer Docker instead? `docker compose up -d db`, then point `DATABASE_URL` at port 5432.

## Development sign-in

There is no external auth service in dev. On `/sign-in`, enter **any email** to find-or-create an account and receive a signed session cookie. The auth layer (`src/lib/auth.ts`) is isolated behind `getCurrentUser` / `createDevSession` / `signOut` so it can be swapped for Auth.js or Clerk without touching call sites.

## Testing

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run test        # Vitest: recommendation engine + DB-backed tenant isolation & generation
npm run test:e2e    # Playwright: full setup-wizard → generated-workspace journey
npm run build       # production build
npm run lint        # ESLint (next/core-web-vitals + next/typescript)
```

`npm run test` and `npm run test:e2e` require the local Postgres to be running (`npm run db:start`). Playwright also needs its browser once: `npx playwright install chromium`.

## Architecture notes

- **Configurable meta-model** (`src/lib/meta-model.ts`): one platform expresses every industry. Record types, field types, relationships, permission groups, workflows, dashboards, and health checks are all data, validated by Zod. Counts are always derived from the payload (`computeCounts`) — never hard-coded.
- **Industry packs** (`src/lib/packs/*`): five versioned packs (generic, publishing, construction, payment-services, software) built on the same meta-model. The payments pack carries a prominent PCI warning and never defines cardholder-data fields.
- **Answer-driven recommendations** (`src/lib/packs/assemble.ts`): the deterministic engine tailors the model to the interview — regulators add a record type + oversight relationship, described stages become a workflow, deadlines/regulated-data add dashboards and health checks — so the counts genuinely reflect the answers.
- **Tenant isolation** (`src/lib/tenant.ts`): every server entry point resolves org access via a membership check before any query; browser-supplied ids can never reach another tenant. Proven by `tests/tenant-and-generation.test.ts`.
- **Transactional generation** (`src/lib/generate-workspace.ts`): approval materializes the model into concrete definitions inside one transaction, writing an append-only audit event. Idempotent via upsert.
- **Audit** (`src/lib/audit.ts`): important mutations (org created, industry selected, wizard completed, recommendation approved, workspace generated) are recorded as append-only events.

## What is implemented vs. planned

**Implemented (Milestone 1):** app shell, dev auth, tenant model + RBAC scaffolding, the full configurable meta-model, five industry packs, the conversational wizard with progress persistence, the deterministic + OpenAI recommendation engine, the visual review/edit/approve screen with per-item explanations and live counts, and transactional workspace generation with audit + a generated-workspace overview.

**Also in place:** basic Obsidian vault export from a generated workspace (`Export to Obsidian` on the workspace page → downloadable `.zip` with Markdown notes, wiki links, and `schema/manifest.json`). Schema-only when no records exist yet.

**Planned (subsequent milestones, scaffolding in place):** graph explorer, org chart, dynamic record forms, CSV/Markdown import, conversational change composer, cited Q&A, workflow editor, health-check evaluation runtime, and seeded demos. The database schema and AI interface already account for these.
