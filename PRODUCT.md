# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind CSS + shadcn-style components + PostgreSQL/Prisma. Already established in the repository; not a greenfield choice.

## Users

*[Inferred — not yet confirmed by the user.]* Primary users are founders, operations leads, and managers at smaller, industry-specific companies (publishing, construction, payment-services sales orgs, software teams) who need a working operating model for their organization without hiring a database architect or enterprise consultant. Their day-to-day teams (secondary audience) later search records, update work, and ask cited questions inside the generated workspace.

## Product Purpose

OrgGraph is an AI-assisted organizational operating system. A guided wizard interviews a company in plain language, then recommends a complete operating model (record types, relationships, permission groups, workflows, dashboards, automated health checks). The customer reviews it visually, edits it, approves it, and generates a functioning workspace — then maintains it through forms, a graph explorer, natural-language change proposals, and cited Q&A.

## Positioning

*[Inferred from docs/competition.md.]* Closest competitors (Glean, Palantir Foundry, Fibery, Notion AI, Atlassian Teamwork Graph) are enterprise-oriented or require the customer to design their own model. OrgGraph's opening is an industry-specific operating system generated through a guided AI wizard, priced and scoped for smaller companies, with portable Markdown (Obsidian-compatible) ownership of the underlying knowledge rather than lock-in.

## Operating Context

Setup is a one-time guided wizard (organization → industry pack → conversational interview → recommendation review/edit/approve → generated workspace). Ongoing use happens inside the generated workspace: dashboards, graph explorer, org chart, dynamic record forms, a conversational change composer, and an "ask the organization" Q&A interface with citations.

## Capabilities and Constraints

- Works fully without an AI key via deterministic industry-pack templates; OpenAI-backed mode is optional and provider-abstracted.
- Every AI-created fact retains source, confidence, and review status; AI proposes, deterministic validation and permissions govern what is saved.
- Tenant-isolated; permissions enforced server-side, not just in the UI.
- The payment-services pack explicitly must never store cardholder data; healthcare/PCI-adjacent flows show prominent warnings.
- Milestone 1 (current state) implements the runnable spine through workspace generation; graph explorer, org chart, dynamic forms, import/export, and the change composer are planned but scaffolded.

## Brand Commitments

- Working name **OrgGraph**, isolated in `src/lib/brand.ts` so it can be renamed in one place. Treat the name as provisional, not durable, until the user confirms otherwise.
- Visual direction pinned by the user via four reference images (panda/yarn mark, app screen with red node graph on paper, blueprint-style construction drafting in black + blue on paper, white node graph on red): a minimal, two-color, construction/technical-drafting design language on a paper ground with black structural ink, where the user picks exactly two accent colors (**Main** and **Accent**) and everything else stays neutral.

## Evidence on Hand

No real customer data, pricing, testimonials, or benchmarks exist yet. The competition analysis (`docs/competition.md`) and build brief (`docs/og-prompt.md`) are planning documents, not verified product claims — do not surface their contents (e.g. specific competitor comparisons) as shipped product copy without the user's confirmation.

## Product Principles

- Users should never need to understand databases, schemas, or graph theory to get value.
- AI proposes; deterministic validation and permissions decide what is saved.
- The product must work fully without any AI key.
- Every important mutation is auditable; sensitive data is never exposed just because two records are connected.
- Feel calm, credible, and executive-friendly — not like a developer database tool.

## Accessibility & Inclusion

*[No product-specific requirement confirmed yet.]* Repo brief calls for WCAG-conscious contrast, accessible form controls, and keyboard navigation as a baseline.
