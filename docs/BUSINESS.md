# OrgGraph — What the Business and App Do

**Working name:** OrgGraph  

**Positioning:** A business-in-a-box generator that converts an organization’s existing information into a living, governed operating model—without requiring the customer to become a database architect.

**Expanded one-liner:** An AI-assisted organizational operating system that turns how a company works into a living knowledge graph — by proposing a complete operating model the customer reviews and approves before anything is built.

---

## The problem

Most companies run on a messy mix of people knowledge, spreadsheets, Slack threads, shared drives, project tools, and tribal process. That creates three recurring failures:

1. **Nobody can see the whole operating picture** — who owns what, who reports to whom, which clients map to which work, which documents support which decisions.
2. **Tools force companies into someone else’s model** — rigid CRMs, generic project trackers, and wiki dumps that don’t match how the business actually operates.
3. **AI that mutates data without governance** — assistants that write into systems without review, provenance, or permission checks.

OrgGraph exists to solve that: **interview the company in plain language, recommend a tailored operating model, let humans approve it, then run the organization on a graph that is useful for real work — not just pretty visualization.**

---

## What the business is

OrgGraph is a **B2B software product** (modular monolith, multi-tenant) for companies that want an operating system for:

- People and teams  
- Clients, vendors, partners, and other participants  
- Projects / primary units of work  
- Documents, decisions, contracts, and obligations  
- Workflows, permissions, dashboards, and operational health checks  

It is **industry-aware but platform-one**: publishing houses, construction firms, payment-services sales orgs, software companies, and generic businesses all run on the same configurable core. Industry “packs” seed the right record types and relationships; the wizard and AI customize from there.

**Temporary branding note:** “OrgGraph” is a working name. Product copy and UI branding are isolated so the company can rename later without a rewrite.

---

## What the app does

### Core product promise

1. A company signs in and creates an organization (isolated tenant).  
2. They choose an **industry pack** (starter operating model for their sector).  
3. They complete a **conversational setup wizard** about how they actually work.  
4. The app generates a **recommended operating model** with exact, real counts — for example:  
   *“Your recommended operating model includes 12 record types, 19 relationships, 4 permission groups, 3 workflows, 6 dashboards, and 8 automated checks.”*  
5. The customer **inspects, edits, and approves** every recommendation (with explanations: why it was included, what business question it answers, which interview answer triggered it, pack vs AI origin).  
6. Approval **generates a functioning workspace** from that model.  
7. From there (full product vision), users work in dashboards and graphs, manage records, ask questions with citations, propose natural-language changes under review, import/export Markdown, and run health checks.

**Critical design rule:** AI proposes; **deterministic validation and permissions** decide what is saved. Users never need to understand databases, schemas, or graph theory.

### What “operating model” means here

Not a slide deck. A machine-usable definition of:

| Piece | Role |
|---|---|
| **Record types** | What kinds of things the org tracks (Person, Project, Merchant, Manuscript, Incident, …) |
| **Fields** | How each record is described (status, dates, currency, links, …) |
| **Relationship types** | How things connect (“owns”, “reports to”, “serves”, “boarded through”, …) |
| **Permission groups** | Who can see/edit what (Admin, Manager, Contributor, Viewer + sensitivity levels) |
| **Workflows** | Ordered states and allowed transitions for work |
| **Dashboards** | Business questions answered at a glance |
| **Health checks** | Automated rules for problems (unowned work, overdue deadlines, unreviewed AI facts, …) |

Everything is tenant-scoped. Connections between records never automatically expose sensitive fields.

---

## Who it’s for

**Primary buyers / users**

- Operators and founders who need a shared operating picture across people, work, and obligations  
- Industry teams whose work doesn’t fit a one-size CRM (publishing, construction, payments sales, software delivery, general services)  
- Managers who need ownership, deadlines, blockers, and approvals without becoming database admins  

**Jobs to be done**

- “Stand up how we work in days, not a six-month systems project.”  
- “See who owns what and what’s stuck.”  
- “Let AI help configure and update the model — but only after humans approve.”  
- “Export or import knowledge in portable Markdown when we need it.”  

---

## Product principles (how we decide)

1. Users should not need databases, schemas, frontmatter, or graph theory.  
2. AI proposes; validation and permissions govern what is saved.  
3. Every AI-created fact keeps source, confidence, and review status.  
4. Markdown is portable import/export — not the sole database.  
5. The product must work without AI via deterministic packs and templates.  
6. Sensitive data is never exposed merely because two records are connected.  
7. Important mutations are auditable.  
8. The graph must help people finish work — not only look impressive.

---

## Industry packs

Starter configurations (same underlying platform):

| Pack | Example focus |
|---|---|
| **Generic business** | People, teams, clients, projects, documents, vendors, agreements, invoices |
| **Publishing** | Authors, titles, manuscripts, editions, rights, editorial pipeline |
| **Construction** | Sites, phases, subcontractors, RFIs, submittals, change orders |
| **Payment-services sales** | Merchants, agents, processors, boarding, residuals, commissions — **explicitly no cardholder data** |
| **Software development** | Products, repos, features, releases, incidents, security controls |

The wizard can still add regulators, custom workflows from the customer’s own stages, deadline dashboards, and stricter security checks based on answers.

---

## How intelligence works

Two modes, one interface:

- **Deterministic mode (always available):** industry pack + wizard answers → valid recommendation with no model call.  
- **AI-enhanced mode (optional):** structured answers → model recommendation → **Zod validation** → reject invalid/unsafe output → fall back to deterministic if AI fails.

Natural-language change requests (full vision) produce a **proposed change set** the user reviews before anything is applied. The mutation path re-validates server-side inside a transaction.

---

## What is built today vs. product vision

### Built now (Milestone 1 — runnable spine)

- Developer sign-in and multi-tenant organizations  
- Industry pack selection  
- Full setup wizard with saved progress  
- Deterministic (+ optional OpenAI) recommendation engine with **computed counts** and per-item explanations  
- Visual review: rename/remove/regenerate/approve  
- Transactional workspace generation (schema definitions, permissions, workflows, dashboards, health checks) + audit trail  
- Generated workspace overview  

### Product vision still to ship in later milestones

- Interactive graph explorer and org chart  
- Dynamic record forms and day-to-day record management  
- CSV / Markdown import  
- Conversational change composer with approve/reject  
- Cited “ask the organization” Q&A  
- Workflow editor runtime, health-check evaluation, richer dashboards  
- Obsidian-compatible vault export  
- Seeded industry demo organizations  

---

## Business model framing (directional)

OrgGraph is positioned as **software for operating the company**, not as a note app or a developer graph database.

Likely value narrative for sales and fundraising:

- **Time-to-structure:** from interview to approved workspace quickly  
- **Industry fit without custom software:** packs + configuration, not a rebuild per vertical  
- **Governed AI:** proposals with review, provenance, and permissions  
- **Portability:** Markdown import/export so customers are not trapped  

Exact pricing, packaging, and GTM are not defined in this document.

---

## One-sentence summary

**OrgGraph is a business-in-a-box generator:** it converts an organization’s existing information into a living, governed operating model—without requiring the customer to become a database architect. AI recommends; humans approve; the workspace becomes useful for ownership, work, and accountability.
