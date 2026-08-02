import { z } from "zod";

// ---------------------------------------------------------------------------
// Setup wizard: answer schema + step model.
// Answers are persisted to WizardSession.answers as JSON after every step so
// progress survives reloads. Partial answers are allowed until completion.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Software-specific wizard constants — hosting providers and SaaS tools.
// ---------------------------------------------------------------------------

export const HOSTING_PROVIDERS = [
  "vercel",
  "railway",
  "fly",
  "netlify",
  "aws",
  "gcp",
  "azure",
  "digitalocean",
  "self_hosted",
] as const;

export type HostingProvider = (typeof HOSTING_PROVIDERS)[number];

export const HOSTING_PROVIDER_LABELS: Record<HostingProvider, string> = {
  vercel: "Vercel",
  railway: "Railway",
  fly: "Fly.io",
  netlify: "Netlify",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  digitalocean: "DigitalOcean",
  self_hosted: "Self-hosted",
};

/** Known metadata for each hosting provider used when creating vendor records. */
export const HOSTING_PROVIDER_META: Record<
  HostingProvider,
  { name: string; url?: string; cost: number; cycle: string }
> = {
  vercel:       { name: "Vercel",        url: "https://vercel.com",             cost: 20,  cycle: "Monthly" },
  railway:      { name: "Railway",       url: "https://railway.app",            cost: 40,  cycle: "Usage-based" },
  fly:          { name: "Fly.io",        url: "https://fly.io",                 cost: 30,  cycle: "Monthly" },
  netlify:      { name: "Netlify",       url: "https://netlify.com",            cost: 19,  cycle: "Monthly" },
  aws:          { name: "AWS",           url: "https://aws.amazon.com",         cost: 0,   cycle: "Usage-based" },
  gcp:          { name: "Google Cloud",  url: "https://cloud.google.com",       cost: 0,   cycle: "Usage-based" },
  azure:        { name: "Azure",         url: "https://azure.microsoft.com",    cost: 0,   cycle: "Usage-based" },
  digitalocean: { name: "DigitalOcean",  url: "https://digitalocean.com",       cost: 20,  cycle: "Monthly" },
  self_hosted:  { name: "Self-hosted",                                          cost: 0,   cycle: "Monthly" },
};

export const TEAM_TOOLS = [
  "github",
  "linear",
  "jira",
  "notion",
  "slack",
  "figma",
  "sentry",
  "datadog",
  "cursor",
  "stripe",
  "resend",
  "sendgrid",
  "google_workspace",
  "posthog",
  "pagerduty",
] as const;

export type TeamTool = (typeof TEAM_TOOLS)[number];

export const TEAM_TOOL_LABELS: Record<TeamTool, string> = {
  github:          "GitHub",
  linear:          "Linear",
  jira:            "Jira",
  notion:          "Notion",
  slack:           "Slack",
  figma:           "Figma",
  sentry:          "Sentry",
  datadog:         "Datadog",
  cursor:          "Cursor",
  stripe:          "Stripe",
  resend:          "Resend",
  sendgrid:        "SendGrid",
  google_workspace:"Google Workspace",
  posthog:         "PostHog",
  pagerduty:       "PagerDuty",
};

/** Known metadata for each SaaS tool used when creating vendor records. */
export const TEAM_TOOL_META: Record<
  TeamTool,
  { name: string; url: string; category: string; cost: number; cycle: string }
> = {
  github:          { name: "GitHub",           url: "https://github.com",                    category: "Dev tools",   cost: 44,  cycle: "Monthly" },
  linear:          { name: "Linear",           url: "https://linear.app",                    category: "Productivity",cost: 32,  cycle: "Monthly" },
  jira:            { name: "Jira",             url: "https://atlassian.com/software/jira",    category: "Productivity",cost: 70,  cycle: "Monthly" },
  notion:          { name: "Notion",           url: "https://notion.so",                     category: "Productivity",cost: 20,  cycle: "Monthly" },
  slack:           { name: "Slack",            url: "https://slack.com",                     category: "Comms",       cost: 60,  cycle: "Monthly" },
  figma:           { name: "Figma",            url: "https://figma.com",                     category: "Design",      cost: 45,  cycle: "Monthly" },
  sentry:          { name: "Sentry",           url: "https://sentry.io",                     category: "Monitoring",  cost: 26,  cycle: "Monthly" },
  datadog:         { name: "Datadog",          url: "https://datadoghq.com",                 category: "Monitoring",  cost: 70,  cycle: "Usage-based" },
  cursor:          { name: "Cursor",           url: "https://cursor.com",                    category: "Dev tools",   cost: 160, cycle: "Monthly" },
  stripe:          { name: "Stripe",           url: "https://stripe.com",                    category: "Payments",    cost: 0,   cycle: "Usage-based" },
  resend:          { name: "Resend",           url: "https://resend.com",                    category: "Email",       cost: 20,  cycle: "Monthly" },
  sendgrid:        { name: "SendGrid",         url: "https://sendgrid.com",                  category: "Email",       cost: 15,  cycle: "Monthly" },
  google_workspace:{ name: "Google Workspace", url: "https://workspace.google.com",          category: "Comms",       cost: 72,  cycle: "Monthly" },
  posthog:         { name: "PostHog",          url: "https://posthog.com",                   category: "Monitoring",  cost: 0,   cycle: "Usage-based" },
  pagerduty:       { name: "PagerDuty",        url: "https://pagerduty.com",                 category: "Monitoring",  cost: 21,  cycle: "Monthly" },
};

// ---------------------------------------------------------------------------
// Domain registrars / DNS providers.
// ---------------------------------------------------------------------------

export const DOMAIN_REGISTRARS = [
  "spaceship",
  "godaddy",
  "namecheap",
  "cloudflare",
  "route53",
  "squarespace_domains",
  "google_domains",
] as const;

export type DomainRegistrar = (typeof DOMAIN_REGISTRARS)[number];

export const DOMAIN_REGISTRAR_LABELS: Record<DomainRegistrar, string> = {
  spaceship:          "Spaceship",
  godaddy:            "GoDaddy",
  namecheap:          "Namecheap",
  cloudflare:         "Cloudflare (DNS / CDN)",
  route53:            "AWS Route 53",
  squarespace_domains:"Squarespace Domains",
  google_domains:     "Google Domains",
};

export const DOMAIN_REGISTRAR_META: Record<
  DomainRegistrar,
  { name: string; url: string; cost: number; cycle: string }
> = {
  spaceship:          { name: "Spaceship",            url: "https://spaceship.com",               cost: 12, cycle: "Annual" },
  godaddy:            { name: "GoDaddy",              url: "https://godaddy.com",                 cost: 20, cycle: "Annual" },
  namecheap:          { name: "Namecheap",            url: "https://namecheap.com",               cost: 11, cycle: "Annual" },
  cloudflare:         { name: "Cloudflare",           url: "https://cloudflare.com",              cost: 0,  cycle: "Usage-based" },
  route53:            { name: "AWS Route 53",         url: "https://aws.amazon.com/route53",       cost: 1,  cycle: "Monthly" },
  squarespace_domains:{ name: "Squarespace Domains",  url: "https://domains.squarespace.com",     cost: 20, cycle: "Annual" },
  google_domains:     { name: "Google Domains",       url: "https://domains.google.com",          cost: 12, cycle: "Annual" },
};

/** Roles offered when capturing employees (mirrors the software pack Person roles). */
export const PERSON_ROLES = [
  "Founder",
  "Engineer",
  "Engineering lead",
  "Product manager",
  "Designer",
  "Investor",
  "Advisor",
] as const;

export const PARTICIPANT_GROUPS = [
  "employees",
  "departments",
  "clients",
  "vendors",
  "contractors",
  "partners",
  "regulators",
] as const;

export const SYSTEMS = [
  "google_drive",
  "sharepoint",
  "dropbox",
  "email",
  "slack_teams",
  "project_management",
  "accounting",
  "github",
  "local_files",
] as const;

export const WizardAnswersSchema = z.object({
  organization: z
    .object({
      name: z.string().trim().max(200).optional(),
      industry: z.string().optional(),
      description: z.string().max(2000).optional(),
      locations: z.array(z.string()).default([]),
      teamSize: z.string().optional(),
      goals: z.string().max(2000).optional(),
    })
    .default({}),
  participants: z
    .object({
      groups: z.array(z.enum(PARTICIPANT_GROUPS)).default([]),
      custom: z.array(z.string()).default([]),
      /** Real employees / teammates, captured as records for the graph. */
      people: z
        .array(
          z.object({
            name: z.string().trim().max(200),
            role: z.string().trim().max(120).optional(),
          }),
        )
        .default([]),
    })
    .default({}),
  valueAndWork: z
    .object({
      sells: z.string().max(1000).optional(),
      primaryUnit: z.string().max(200).optional(),
      stages: z.array(z.string()).default([]),
      outputs: z.string().max(1000).optional(),
      deadlinesMatter: z.boolean().default(false),
      blockers: z.string().max(1000).optional(),
      /** Names of the services / apps this company runs (e.g. "Web app", "API"). */
      services: z.array(z.string()).default([]),
      /** Product features and how they connect (owner + the service they run in). */
      features: z
        .array(
          z.object({
            name: z.string().trim().max(200),
            /** Name of a captured service this feature runs in (ref by name). */
            service: z.string().trim().max(200).optional(),
            /** Name of a captured person who owns this feature (ref by name). */
            owner: z.string().trim().max(200).optional(),
          }),
        )
        .default([]),
    })
    .default({}),
  systems: z
    .object({
      selected: z.array(z.enum(SYSTEMS)).default([]),
      other: z.string().max(500).optional(),
      /** Hosting / cloud providers they deploy to. */
      hostingProviders: z.array(z.enum(HOSTING_PROVIDERS)).default([]),
      /** SaaS tools the engineering team uses. */
      teamTools: z.array(z.enum(TEAM_TOOLS)).default([]),
      /** Domain registrars / DNS providers. */
      domainRegistrars: z.array(z.enum(DOMAIN_REGISTRARS)).default([]),
    })
    .default({}),
  security: z
    .object({
      confidentialInfo: z.string().max(1000).optional(),
      financialRoles: z.string().max(500).optional(),
      employeeInfoRoles: z.string().max(500).optional(),
      regulatedData: z.boolean().default(false),
      requireAiApproval: z.boolean().default(true),
    })
    .default({}),
});

export type WizardAnswers = z.infer<typeof WizardAnswersSchema>;

export const WIZARD_STEPS = [
  { key: "organization", label: "Organization" },
  { key: "participants", label: "Participants" },
  { key: "value", label: "Value & work" },
  { key: "systems", label: "Systems" },
  { key: "security", label: "Security" },
  { key: "review", label: "Recommendation" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export function stepIndex(key: string): number {
  const i = WIZARD_STEPS.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

export function nextStep(key: WizardStepKey): WizardStepKey {
  const i = stepIndex(key);
  return WIZARD_STEPS[Math.min(i + 1, WIZARD_STEPS.length - 1)]!.key;
}

export function emptyAnswers(): WizardAnswers {
  return WizardAnswersSchema.parse({});
}

export const PARTICIPANT_LABELS: Record<(typeof PARTICIPANT_GROUPS)[number], string> = {
  employees: "Employees",
  departments: "Departments",
  clients: "Clients",
  vendors: "Vendors",
  contractors: "Contractors",
  partners: "Partners",
  regulators: "Regulators",
};

export const SYSTEM_LABELS: Record<(typeof SYSTEMS)[number], string> = {
  google_drive: "Google Drive",
  sharepoint: "SharePoint",
  dropbox: "Dropbox",
  email: "Email",
  slack_teams: "Slack / Teams",
  project_management: "Project management tool",
  accounting: "Accounting system",
  github: "GitHub",
  local_files: "Local files",
};
