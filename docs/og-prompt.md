Below is a master build prompt designed for an agentic IDE. It turns the “12 record types, 19 relationships…” recommendation into a core product feature: the wizard proposes a complete operating model, explains it, and lets the customer approve or edit it before generation.

You are a principal product engineer, AI architect, UX designer, and security-minded technical lead. Build a polished, production-minded MVP of the application described below.

Do not return only a plan, mockup, or isolated code samples. Inspect the existing repository, make reasonable decisions, implement the application end to end, run it, test the critical paths, and leave clear setup instructions.

If the repository already contains a working stack, preserve it where practical. Otherwise, use:

- Next.js with App Router
- TypeScript in strict mode
- Tailwind CSS
- shadcn/ui or similarly accessible components
- PostgreSQL
- Prisma or Drizzle ORM
- Auth.js or Clerk-compatible authentication architecture
- React Flow for graph visualization
- Zod for validation
- Vitest and Playwright
- Docker Compose for local PostgreSQL
- OpenAI’s current official SDK behind a provider abstraction
- Local deterministic mock AI mode when no API key is available

Use a modular monolith for the MVP. Do not introduce microservices, Kubernetes, Kafka, or a dedicated graph database unless the existing repository clearly requires them.

# Product name

Use “OrgGraph” as a temporary working name. Keep branding isolated so it can be renamed easily.

# Product vision

OrgGraph is an AI-assisted organizational operating system.

It helps any company turn its people, teams, clients, partners, projects, documents, workflows, obligations, and financial relationships into a living knowledge graph.

A guided setup wizard interviews a company in plain language. It then recommends an organizational model such as:

- 12 record types
- 19 relationship types
- 4 permission groups
- 3 workflows
- 6 dashboards
- 8 automated health checks

The customer reviews the recommendation visually, edits it, approves it, and generates a functioning workspace.

The product must feel industry-specific to the customer while being powered by one configurable core platform.

# Product principles

1. Users should not need to understand databases, schemas, frontmatter, or graph theory.
2. AI proposes changes; deterministic validation and permissions govern what is saved.
3. Every AI-created fact must retain its source, confidence, and review status.
4. Markdown is a portable import/export format, not the sole application database.
5. The interface must work without AI by using deterministic templates and seed packs.
6. Sensitive data must never be exposed merely because two records are connected.
7. Every important mutation must be auditable.
8. The graph must help users complete work, not merely look impressive.

# Primary user journey

Build this complete journey:

1. User signs in.
2. User creates an organization.
3. User chooses an industry pack:
   - Generic business
   - Publishing
   - Construction
   - Payment-services sales organization
   - Software development
   - Restaurant & hospitality
4. User completes a conversational setup wizard.
5. User optionally imports CSV or Markdown files.
6. The application generates a recommended operating model.
7. A recommendation screen displays exact counts and explanations:
   - Record types
   - Relationship types
   - Permission groups
   - Workflows
   - Dashboards
   - Automated checks
8. User can inspect, add, edit, remove, and approve each recommendation.
9. User generates the workspace.
10. User lands on a populated dashboard and interactive graph.
11. User can create and edit records using normal forms.
12. User can type a natural-language instruction and receive a proposed change set.
13. User reviews the proposed changes before applying them.
14. User can ask questions about the organization and see answers with source citations.
15. User can export the workspace as an Obsidian-compatible Markdown vault.

# Setup wizard

Create an approachable, visually polished wizard with progress persistence.

Collect:

## Organization

- Organization name
- Industry
- Description
- Locations
- Approximate team size
- Primary business goals

## Participants

Ask which groups interact with the company:

- Employees
- Departments
- Clients
- Vendors
- Contractors
- Partners
- Regulators
- Other user-defined groups

Allow CSV import for people and organizations.

## Value and work

Ask:

- What does the company sell or deliver?
- What is its primary unit of work?
- What stages does that work pass through?
- Who owns each stage?
- Who approves each stage?
- What outputs or documents are produced?
- What deadlines matter?
- What commonly causes work to become blocked?

## Systems and documents

Ask where information currently lives:

- Google Drive
- SharePoint
- Dropbox
- Email
- Slack or Teams
- Project-management tools
- Accounting system
- GitHub
- Local files
- Other

These are configuration selections for the MVP. Do not implement every external integration. Create a clean connector interface and demonstrate it with CSV, Markdown, and sample connectors.

## Security

Ask:

- What information is confidential?
- Which roles may access financial information?
- Which roles may access employee information?
- Is regulated or highly sensitive information involved?
- Should AI-created changes always require approval?

Display warnings for healthcare and payment-card information. Do not store medical records, cardholder data, authentication secrets, or complete payment credentials.

# Recommendation engine

Build a recommendation engine that works in two modes:

## Deterministic mode

Uses the selected industry pack and wizard answers to generate a valid recommendation without calling an AI model.

## AI-enhanced mode

Sends structured wizard answers to an AI provider and requests recommendations conforming to a strict JSON schema.

Validate the response with Zod. Reject invalid types, duplicate identifiers, invalid relationships, and unsafe fields. Fall back to deterministic recommendations when AI fails.

The generated recommendation must contain:

- Record type definitions
- Field definitions
- Relationship definitions
- Permission groups
- Workflow definitions
- Dashboard definitions
- Automated health checks
- Suggested natural-language questions
- Import mappings
- Markdown templates

Show a summary card with exact counts, for example:

“Your recommended operating model includes 12 record types, 19 relationships, 4 permission groups, 3 workflows, 6 dashboards, and 8 automated checks.”

Each count must be calculated from actual recommendation data, never hard-coded.

Each recommendation must explain:

- Why it was selected
- What business question it helps answer
- Which wizard response caused it to be included
- Whether it came from an industry pack or AI customization

# Configurable meta-model

Do not hard-code the product around a single industry.

Implement tenant-specific schema definitions supporting:

## Record types

Examples:

- Person
- Team
- Client
- Project
- Merchant
- Subcontractor
- Repository
- Incident
- Contract
- Deliverable

Each record type supports:

- Stable machine identifier
- Display name
- Description
- Icon
- Color
- Field definitions
- Markdown template
- Sensitivity classification
- Archival behavior

## Field types

Support at minimum:

- Short text
- Long text
- Number
- Currency
- Percentage
- Boolean
- Date
- Date and time
- Status
- Single select
- Multi-select
- Email
- URL
- Relationship reference
- File or source link

## Relationship types

Each relationship definition includes:

- Stable identifier
- Source record type
- Target record type
- Forward label
- Reverse label
- Cardinality
- Required or optional
- Sensitivity
- Validity dates where appropriate

Examples:

- Person manages Person
- Person belongs to Team
- Person owns Project
- Project serves Client
- Document supports Decision
- Merchant is boarded through Processor
- Feature belongs to Product
- Incident affects Service

## Records and relationships

All records must be tenant-scoped and use immutable IDs. Display names and slugs may change without breaking relationships.

Relationships must be first-class database records with:

- Source
- Target
- Relationship type
- Metadata
- Source attribution
- Creation time
- Creator
- Valid-from and valid-until dates
- Review status

# Industry packs

Create versioned configuration files for five starter packs.

## Generic business

Include people, teams, clients, projects, tasks, documents, meetings, decisions, vendors, agreements, invoices, and locations.

## Publishing

Include authors, titles, imprints, projects, editors, manuscripts, editions, rights, deliverables, vendors, contracts, and decisions.

## Construction

Include clients, projects, sites, phases, employees, subcontractors, drawings, RFIs, submittals, inspections, change orders, contracts, invoices, and decisions.

## Payment-services sales organization

Include merchants, agents, processors, acquiring partners, applications, pricing schedules, processing agreements, terminals, residual statements, commission splits, support cases, and compliance documents.

This pack must explicitly avoid storing cardholder data. Include a prominent warning and safe-field restrictions.

## Software development

Include customers, products, repositories, services, environments, requirements, features, tickets, sprints, releases, deployments, incidents, decisions, subscriptions, and security controls.

Packs must use the same underlying meta-model. Avoid separate database tables for every industry-specific concept.

# Graph explorer

Build an interactive graph experience with:

- Zoom and pan
- Fit-to-screen
- Search
- Record-type filters
- Relationship filters
- Status filters
- Saved views
- Expand neighbors
- Collapse branches
- Directional relationship labels
- A record details side panel
- Permission-aware results
- List view as an accessible alternative
- Useful empty states
- Loading and error states

Do not render the entire tenant graph by default. Load a bounded neighborhood around selected records and support pagination or expansion.

Clicking a node must open its details, relationships, source information, history, and available actions.

# Org chart

Create an org-chart view generated from “belongs to,” “reports to,” and “manages” relationships.

Support:

- Departments
- Vacant roles
- Dotted-line reporting
- Drag-and-drop reassignment
- Preview before saving
- Undo for the most recent change
- Validation against circular reporting relationships

# Record management

Generate forms dynamically from record-type field definitions.

Users must be able to:

- Create, view, edit, archive, and restore records
- Add and remove relationships
- Search and filter records
- See related records
- See provenance
- See audit history
- Attach source links
- mark AI-extracted information as reviewed

Use optimistic UI only where rollback is reliable.

# Conversational change composer

Add a command box where a user can write:

“Create a project for the Weston Museum catalogue. Maya owns it, the manuscript is due September 12, and Studio North is handling design.”

The system must not immediately mutate data.

It must produce a structured proposed change set containing:

- Records to create
- Records to update
- Relationships to create or remove
- Ambiguities
- Validation warnings
- Permission warnings
- Confidence
- Source text

Present a readable diff. Users can approve all, approve selected operations, edit operations, or reject them.

The mutation endpoint must revalidate the approved operations server-side before applying them in a transaction.

Provide a deterministic demo parser so this workflow works without an AI key.

# Ask the organization

Create a question-and-answer interface.

For the MVP, support graph-aware deterministic questions such as:

- Who owns this project?
- What projects belong to this client?
- Which records have no owner?
- What deadlines are approaching?
- Which projects are blocked?
- What documents support this decision?
- What records have not been reviewed recently?

Add an AI synthesis layer when configured.

Every answer must display citations linking to the records or source documents used. Do not display an unsupported answer as fact. Clearly label inference and uncertainty.

# Workflows

A workflow definition contains:

- Name
- Applicable record type
- Ordered states
- Allowed transitions
- Required fields for transitions
- Required approvals
- Actions or notifications
- Completion rules

Build a visual workflow editor and a runtime status control.

Example construction workflow:

Lead → Estimating → Contracted → Mobilization → Active → Closeout → Archived

Example software workflow:

Proposed → Planned → In Development → Review → Released

# Permissions

Implement tenant isolation and role-based access control.

Starter permission groups:

- Organization administrator
- Manager
- Contributor
- Viewer

Also support field- or record-type sensitivity levels:

- General
- Internal
- Confidential
- Restricted

Enforce permissions on the server, not only in the interface.

Never send fields to the AI provider if the current user cannot read them. Provide an extension point for excluding restricted data from AI processing entirely.

Include tests proving that one organization cannot access another organization’s records.

# Provenance and auditability

Every AI-extracted or imported fact must support:

- Source type
- Source identifier
- Source link
- Source excerpt where legally permitted
- Confidence
- Extraction time
- Extractor version
- Review status
- Reviewer
- Review time

Audit:

- Record creation and changes
- Relationship changes
- Permission changes
- Imports
- AI proposals
- Proposal approvals and rejections
- Exports

Use append-only audit events for important mutations.

# Importing

Implement:

## CSV import

- Upload
- Preview
- Column mapping
- Record-type selection
- Validation
- Duplicate detection
- Error report
- Confirmed import

## Markdown import

Support YAML frontmatter, wiki links such as `[[Project Name]]`, headings, and body content.

Resolve links where unambiguous and show unresolved links for review.

Do not silently merge uncertain duplicates.

# Obsidian-compatible export

Export a ZIP containing:

- One Markdown file per record
- YAML frontmatter
- Wiki-style links
- Type-based folders
- An attachments or sources manifest
- A schema manifest
- A README explaining the vault
- Saved index pages or dashboards where practical

Example:

```markdown
---
id: project_01HXYZ
type: project
status: active
owner: "[[Maya Chen]]"
client: "[[Weston Museum]]"
due_date: 2026-09-12
last_reviewed: 2026-08-01
---

# Weston Museum Catalogue

## Relationships

- Owned by [[Maya Chen]]
- Serves [[Weston Museum]]
- Design partner [[Studio North]]

## Sources

- [[Project Brief]]
```

Prevent unsafe filenames and broken path traversal. Maintain stable IDs in frontmatter.

# Dashboards

Generate configurable dashboard widgets from the approved recommendation.

Support:

- Count by record type
- Count by status
- Upcoming deadlines
- Unowned work
- Blocked work
- Recently changed records
- Unreviewed AI suggestions
- Graph-health issues
- Workflow distribution
- Recent audit events

Dashboards should be configurable through data, not individually hard-coded for every industry.

# Automated health checks

Build a small rules engine supporting checks such as:

- Active project has no owner
- Deadline is overdue
- Record has not been reviewed recently
- Required relationship is missing
- Relationship references an archived record
- Restricted record lacks an access policy
- Workflow is blocked
- Imported fact remains unreviewed
- Contract is approaching expiration
- Duplicate candidate detected

Show severity, explanation, affected records, suggested resolution, and dismissal history.

# Required screens

Implement:

1. Marketing or welcome screen
2. Sign-in or development sign-in
3. Organization creation
4. Industry selection
5. Setup wizard
6. Generated recommendation review
7. Workspace-generation progress
8. Main dashboard
9. Graph explorer
10. Org chart
11. Record-type browser
12. Record detail
13. Dynamic record editor
14. Import center
15. Conversational change composer
16. Ask-the-organization interface
17. Workflow editor
18. Schema editor
19. Permission settings
20. Audit log
21. Export center

# UX direction

The application should feel calm, credible, and executive-friendly—not like a developer database tool.

Use:

- Clear typography
- Restrained color
- Excellent spacing
- Progressive disclosure
- Plain-language labels
- Helpful empty states
- Accessible form controls
- Keyboard navigation
- Responsive layouts
- WCAG-conscious contrast

Avoid:

- Decorative gradients everywhere
- Excessive glass effects
- Dense technical terminology
- Raw JSON in primary user flows
- Giant graphs with unreadable labels
- Fake buttons or dead controls
- Charts that do not answer a business question

Use realistic seeded data instead of lorem ipsum.

# Suggested database entities

Design and migrate an appropriate normalized schema. It will likely include:

- User
- Organization
- Membership
- PermissionGroup
- MembershipRole
- IndustryPack
- SchemaVersion
- RecordTypeDefinition
- FieldDefinition
- RelationshipTypeDefinition
- Record
- RecordFieldValue or validated JSON payload
- Relationship
- WorkflowDefinition
- WorkflowInstance
- DashboardDefinition
- HealthCheckDefinition
- HealthCheckResult
- Source
- Provenance
- ImportJob
- ImportRow
- AIProposal
- AIProposalOperation
- AuditEvent
- SavedGraphView

JSON fields are acceptable for configurable definitions and validated record payloads, but preserve relational integrity for tenants, records, relationships, memberships, and audit events.

Add appropriate indexes, foreign keys, unique constraints, and organization scoping.

# API and server behavior

Use server actions or typed API routes consistently.

Requirements:

- Validate every input
- Authenticate every protected request
- Scope every query by organization
- Enforce authorization server-side
- Use transactions for multi-operation approvals
- Return structured, user-friendly errors
- Add rate-limit extension points for AI and import endpoints
- Avoid leaking sensitive details in logs
- Never trust identifiers supplied by the browser without checking tenant ownership

# AI abstraction

Create an interface such as:

```ts
interface OrganizationIntelligenceProvider {
  recommendSchema(input: WizardAnswers): Promise<SchemaRecommendation>;
  proposeChanges(input: ChangeRequest): Promise<ProposedChangeSet>;
  answerQuestion(input: OrganizationQuestion): Promise<CitedAnswer>;
  classifyImport(input: ImportClassificationRequest): Promise<ImportSuggestion>;
}
```

Implement:

- A deterministic local provider
- An OpenAI provider enabled by environment configuration

Use structured outputs or strict schema validation. Keep prompts versioned and testable.

Do not expose API keys to the browser.

# Seed and demonstration

Create one-click demo organizations for:

- A publishing house
- A construction company
- A payment-services sales organization
- A software company

Each demo must include realistic:

- People
- Teams
- External organizations
- Projects or primary work units
- Documents
- Relationships
- Workflows
- Health issues
- Dashboard data
- Audit events

The demos must make the graph and dashboards useful immediately.

# Testing

At minimum, test:

- Tenant isolation
- Permission enforcement
- Industry-pack generation
- Recommendation counts
- Zod validation of AI output
- Record creation from dynamic schemas
- Relationship cardinality
- Prevention of circular management relationships
- Health-check evaluation
- CSV import validation
- Markdown link resolution
- Proposed-change approval transaction
- Obsidian export
- Critical setup-wizard journey
- Critical graph-to-record journey

Do not claim tests pass unless they actually run successfully.

# Delivery sequence

Work in vertical slices so the application remains runnable.

1. Inspect the repository and document assumptions.
2. Establish the application shell, database, authentication, and tenant model.
3. Implement the configurable meta-model and industry packs.
4. Implement the wizard and deterministic recommendation engine.
5. Implement recommendation review and workspace generation.
6. Implement records, relationships, graph explorer, and org chart.
7. Implement health checks, dashboards, workflows, and permissions.
8. Implement CSV and Markdown import.
9. Implement conversational proposals and cited questions.
10. Implement Obsidian-compatible export.
11. Add realistic demos, automated tests, and final polish.
12. Run linting, type-checking, tests, and the production build.
13. Fix failures before reporting completion.

# Completion requirements

The application is complete only when:

- A new user can create an organization.
- The wizard produces a real recommendation with calculated counts.
- The recommendation can be edited and approved.
- Approval generates a functioning workspace.
- Users can create records and relationships.
- The graph and org chart visualize stored data.
- Permissions are enforced server-side.
- A natural-language request produces a reviewable change set.
- Approved operations are applied transactionally.
- Organizational questions return cited answers.
- Health checks identify real issues.
- CSV and Markdown imports have preview and validation.
- The workspace exports as a usable Obsidian vault.
- At least four seeded industry demos work.
- Critical tests pass.
- The application runs from documented local setup steps.

# Final response format

When finished, report:

1. What was built
2. Important architectural decisions
3. How to run it
4. Demo credentials or development sign-in instructions
5. Tests and checks executed, including actual outcomes
6. Known limitations
7. The safest next production steps

Do not stop after scaffolding. Continue implementing until the end-to-end MVP is functional. When a requirement cannot be completed, implement the best safe fallback and clearly document the remaining gap.