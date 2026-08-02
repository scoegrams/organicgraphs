/**
 * A realistic Software-company demo: real people (including Ryan, an investor),
 * the vendors they run on (Vercel, Railway, Resend, Stripe), products, services,
 * features with owners, and an open incident. Designed to produce a graph that
 * actually tells the company's story once exported or explored.
 *
 * Records reference each other by `localId`; the seeder resolves those to the
 * real database ids after creating records.
 */

export interface DemoRecord {
  localId: string;
  recordTypeKey: string;
  displayName: string;
  status?: string;
  values?: Record<string, unknown>;
}

export interface DemoRelationship {
  relationshipTypeKey: string;
  sourceLocalId: string;
  targetLocalId: string;
}

export interface DemoDataset {
  records: DemoRecord[];
  relationships: DemoRelationship[];
  /** Record type keys this dataset needs to exist on the workspace. */
  requiredRecordTypeKeys: string[];
  /** Relationship type keys this dataset needs to exist on the workspace. */
  requiredRelationshipTypeKeys: string[];
}

export function softwareDemoDataset(): DemoDataset {
  const records: DemoRecord[] = [
    // People
    { localId: "p_ryan", recordTypeKey: "person", displayName: "Ryan Bell", values: { role: "Investor", email: "ryan@northline.vc", notes: "Lead investor, seed round." } },
    { localId: "p_nadia", recordTypeKey: "person", displayName: "Nadia Kseib", values: { role: "Investor", email: "nadia@harborcap.com", notes: "Follow-on investor." } },
    { localId: "p_sam", recordTypeKey: "person", displayName: "Sam Ortiz", values: { role: "Founder", email: "sam@devstudio.app" } },
    { localId: "p_priya", recordTypeKey: "person", displayName: "Priya Nair", values: { role: "Engineering lead", email: "priya@devstudio.app" } },
    { localId: "p_alex", recordTypeKey: "person", displayName: "Alex Rivera", values: { role: "Engineer", email: "alex@devstudio.app" } },
    { localId: "p_marcus", recordTypeKey: "person", displayName: "Marcus Lee", values: { role: "Engineer", email: "marcus@devstudio.app" } },
    { localId: "p_dana", recordTypeKey: "person", displayName: "Dana Wu", values: { role: "Product manager", email: "dana@devstudio.app" } },
    { localId: "p_lena", recordTypeKey: "person", displayName: "Lena Fischer", values: { role: "Designer", email: "lena@devstudio.app" } },
    { localId: "p_tom", recordTypeKey: "person", displayName: "Tom Alvarez", values: { role: "Advisor", email: "tom@advisors.io", notes: "Go-to-market advisor." } },

    // Providers / subscriptions
    { localId: "v_vercel", recordTypeKey: "vendor", displayName: "Vercel", status: "Active", values: { category: "Hosting", cost: 20, cycle: "Monthly", url: "https://vercel.com", status: "Active" } },
    { localId: "v_railway", recordTypeKey: "vendor", displayName: "Railway", status: "Active", values: { category: "Hosting", cost: 40, cycle: "Usage-based", url: "https://railway.app", status: "Active" } },
    { localId: "v_resend", recordTypeKey: "vendor", displayName: "Resend", status: "Active", values: { category: "Email", cost: 20, cycle: "Monthly", url: "https://resend.com", status: "Active" } },
    { localId: "v_stripe", recordTypeKey: "vendor", displayName: "Stripe", status: "Active", values: { category: "Payments", cost: 0, cycle: "Usage-based", url: "https://stripe.com", status: "Active" } },
    { localId: "v_google", recordTypeKey: "vendor", displayName: "Google Workspace", status: "Active", values: { category: "Comms", cost: 72, cycle: "Monthly", url: "https://workspace.google.com", status: "Active" } },
    { localId: "v_cursor", recordTypeKey: "vendor", displayName: "Cursor", status: "Active", values: { category: "Dev tools", cost: 160, cycle: "Monthly", url: "https://cursor.com", status: "Active" } },
    { localId: "v_github", recordTypeKey: "vendor", displayName: "GitHub", status: "Active", values: { category: "Dev tools", cost: 44, cycle: "Monthly", url: "https://github.com", status: "Active" } },
    { localId: "v_linear", recordTypeKey: "vendor", displayName: "Linear", status: "Active", values: { category: "Productivity", cost: 32, cycle: "Monthly", url: "https://linear.app", status: "Active" } },
    { localId: "v_sentry", recordTypeKey: "vendor", displayName: "Sentry", status: "Active", values: { category: "Monitoring", cost: 26, cycle: "Monthly", url: "https://sentry.io", status: "Active" } },
    { localId: "v_slack", recordTypeKey: "vendor", displayName: "Slack", status: "Active", values: { category: "Comms", cost: 60, cycle: "Monthly", url: "https://slack.com", status: "Active" } },
    { localId: "v_figma", recordTypeKey: "vendor", displayName: "Figma", status: "Active", values: { category: "Design", cost: 45, cycle: "Monthly", url: "https://figma.com", status: "Active" } },
    { localId: "v_datadog", recordTypeKey: "vendor", displayName: "Datadog", status: "Trial", values: { category: "Monitoring", cost: 70, cycle: "Usage-based", url: "https://datadoghq.com", status: "Trial" } },

    // Product
    { localId: "prod_studio", recordTypeKey: "product", displayName: "Developer Studio" },

    // Repositories
    { localId: "repo_web", recordTypeKey: "repository", displayName: "studio-web", values: { url: "https://github.com/devstudio/studio-web" } },
    { localId: "repo_api", recordTypeKey: "repository", displayName: "studio-api", values: { url: "https://github.com/devstudio/studio-api" } },
    { localId: "repo_worker", recordTypeKey: "repository", displayName: "studio-worker", values: { url: "https://github.com/devstudio/studio-worker" } },

    // Services
    { localId: "svc_web", recordTypeKey: "service", displayName: "Web app", status: "Healthy", values: { status: "Healthy" } },
    { localId: "svc_api", recordTypeKey: "service", displayName: "API", status: "Degraded", values: { status: "Degraded" } },
    { localId: "svc_worker", recordTypeKey: "service", displayName: "Background worker", status: "Healthy", values: { status: "Healthy" } },
    { localId: "svc_auth", recordTypeKey: "service", displayName: "Auth service", status: "Healthy", values: { status: "Healthy" } },

    // Environments
    { localId: "env_prod", recordTypeKey: "environment", displayName: "Production", values: { kind: "production" } },
    { localId: "env_staging", recordTypeKey: "environment", displayName: "Staging", values: { kind: "staging" } },

    // Requirements
    { localId: "req_payments", recordTypeKey: "requirement", displayName: "PCI-compliant checkout", values: { notes: "Payments must never store raw card data." } },
    { localId: "req_sso", recordTypeKey: "requirement", displayName: "Enterprise SSO", values: { notes: "SAML + SCIM for enterprise accounts." } },
    { localId: "req_realtime", recordTypeKey: "requirement", displayName: "Realtime collaboration", values: { notes: "Multiplayer editing with presence." } },

    // Features (billing intentionally unowned)
    { localId: "f_checkout", recordTypeKey: "feature", displayName: "Checkout redesign", status: "In development", values: { status: "In development" } },
    { localId: "f_onboarding", recordTypeKey: "feature", displayName: "Onboarding v2", status: "Review", values: { status: "Review" } },
    { localId: "f_sso", recordTypeKey: "feature", displayName: "SSO / SAML", status: "Planned", values: { status: "Planned" } },
    { localId: "f_billing", recordTypeKey: "feature", displayName: "Billing portal", status: "In development", values: { status: "In development" } },
    { localId: "f_darkmode", recordTypeKey: "feature", displayName: "Dark mode", status: "Review", values: { status: "Review" } },
    { localId: "f_realtime", recordTypeKey: "feature", displayName: "Realtime sync", status: "In development", values: { status: "In development" } },

    // Tickets
    { localId: "t_checkout_bug", recordTypeKey: "ticket", displayName: "Checkout: tax rounding error", status: "Open", values: { status: "Open" } },
    { localId: "t_realtime_timeout", recordTypeKey: "ticket", displayName: "Realtime: socket timeout under load", status: "In progress", values: { status: "In progress" } },
    { localId: "t_sso_edge", recordTypeKey: "ticket", displayName: "SSO: Okta metadata parsing", status: "Open", values: { status: "Open" } },
    { localId: "t_ui_polish", recordTypeKey: "ticket", displayName: "Dark mode: contrast on charts", status: "Closed", values: { status: "Closed" } },

    // Sprints
    { localId: "s_sprint1", recordTypeKey: "sprint", displayName: "Sprint 24", values: { start: "2026-07-14", end: "2026-07-28" } },
    { localId: "s_sprint2", recordTypeKey: "sprint", displayName: "Sprint 25", values: { start: "2026-07-28", end: "2026-08-11" } },

    // Releases
    { localId: "rel_v1", recordTypeKey: "release", displayName: "v1.2.0", values: { version: "1.2.0", date: "2026-07-27" } },
    { localId: "rel_v2", recordTypeKey: "release", displayName: "v1.3.0", values: { version: "1.3.0", date: "2026-08-10" } },

    // Deployments
    { localId: "dep_1", recordTypeKey: "deployment", displayName: "Deploy v1.2.0 → Production", status: "Deployed", values: { status: "Deployed", at: "2026-07-27T18:30:00.000Z" } },
    { localId: "dep_2", recordTypeKey: "deployment", displayName: "Deploy v1.3.0 → Staging", status: "Deployed", values: { status: "Deployed", at: "2026-08-01T15:00:00.000Z" } },

    // Customers
    { localId: "c_acme", recordTypeKey: "customer", displayName: "Acme Corp", values: { email: "ops@acme.example" } },
    { localId: "c_globex", recordTypeKey: "customer", displayName: "Globex", values: { email: "it@globex.example" } },
    { localId: "c_initech", recordTypeKey: "customer", displayName: "Initech", values: { email: "admin@initech.example" } },

    // Revenue subscriptions
    { localId: "sub_acme", recordTypeKey: "subscription", displayName: "Acme — Enterprise", status: "Active", values: { amount: 1800, status: "Active" } },
    { localId: "sub_globex", recordTypeKey: "subscription", displayName: "Globex — Team", status: "Trial", values: { amount: 400, status: "Trial" } },

    // Incidents
    { localId: "inc_api", recordTypeKey: "incident", displayName: "API latency spike", status: "Investigating", values: { status: "Investigating", severity: "SEV2" } },
    { localId: "inc_auth", recordTypeKey: "incident", displayName: "Auth login failures", status: "Resolved", values: { status: "Resolved", severity: "SEV1" } },

    // Decisions
    { localId: "dec_hosting", recordTypeKey: "decision", displayName: "Host the API on Railway", values: { notes: "Chose Railway over self-managed for speed; revisit at scale." } },
    { localId: "dec_auth", recordTypeKey: "decision", displayName: "Build SSO in-house", values: { notes: "Own the SAML flow rather than a third-party gateway." } },

    // Security controls
    { localId: "sec_mfa", recordTypeKey: "security_control", displayName: "MFA enforcement", values: { framework: "SOC 2", status: "Implemented" } },
    { localId: "sec_encryption", recordTypeKey: "security_control", displayName: "Encryption at rest", values: { framework: "SOC 2", status: "Partial" } },
  ];

  const relationships: DemoRelationship[] = [
    // Investment
    { relationshipTypeKey: "investor_backs_product", sourceLocalId: "p_ryan", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "investor_backs_product", sourceLocalId: "p_nadia", targetLocalId: "prod_studio" },

    // Org chart (reports to)
    { relationshipTypeKey: "person_reports_to", sourceLocalId: "p_priya", targetLocalId: "p_sam" },
    { relationshipTypeKey: "person_reports_to", sourceLocalId: "p_dana", targetLocalId: "p_sam" },
    { relationshipTypeKey: "person_reports_to", sourceLocalId: "p_alex", targetLocalId: "p_priya" },
    { relationshipTypeKey: "person_reports_to", sourceLocalId: "p_marcus", targetLocalId: "p_priya" },
    { relationshipTypeKey: "person_reports_to", sourceLocalId: "p_lena", targetLocalId: "p_dana" },

    // Feature ownership (f_billing intentionally unowned)
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_alex", targetLocalId: "f_checkout" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_dana", targetLocalId: "f_onboarding" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_priya", targetLocalId: "f_sso" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_marcus", targetLocalId: "f_realtime" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_lena", targetLocalId: "f_darkmode" },

    // Service operators
    { relationshipTypeKey: "person_operates_service", sourceLocalId: "p_priya", targetLocalId: "svc_api" },
    { relationshipTypeKey: "person_operates_service", sourceLocalId: "p_alex", targetLocalId: "svc_web" },
    { relationshipTypeKey: "person_operates_service", sourceLocalId: "p_marcus", targetLocalId: "svc_worker" },
    { relationshipTypeKey: "person_operates_service", sourceLocalId: "p_priya", targetLocalId: "svc_auth" },

    // Hosting
    { relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: "svc_web", targetLocalId: "v_vercel" },
    { relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: "svc_api", targetLocalId: "v_railway" },
    { relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: "svc_worker", targetLocalId: "v_railway" },
    { relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: "svc_auth", targetLocalId: "v_railway" },

    // Services built from repositories
    { relationshipTypeKey: "service_in_repository", sourceLocalId: "svc_web", targetLocalId: "repo_web" },
    { relationshipTypeKey: "service_in_repository", sourceLocalId: "svc_api", targetLocalId: "repo_api" },
    { relationshipTypeKey: "service_in_repository", sourceLocalId: "svc_worker", targetLocalId: "repo_worker" },

    // Product uses subscriptions (integrations & platform spend)
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod_studio", targetLocalId: "v_resend" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod_studio", targetLocalId: "v_stripe" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod_studio", targetLocalId: "v_sentry" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod_studio", targetLocalId: "v_datadog" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod_studio", targetLocalId: "v_github" },

    // People use subscriptions — the team's SaaS stack
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_sam", targetLocalId: "v_cursor" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_priya", targetLocalId: "v_cursor" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_alex", targetLocalId: "v_cursor" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_marcus", targetLocalId: "v_cursor" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_sam", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_priya", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_alex", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_marcus", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_dana", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_lena", targetLocalId: "v_google" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_sam", targetLocalId: "v_slack" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_dana", targetLocalId: "v_linear" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_priya", targetLocalId: "v_linear" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_lena", targetLocalId: "v_figma" },

    // Features belong to product
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_checkout", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_onboarding", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_sso", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_billing", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_darkmode", targetLocalId: "prod_studio" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_realtime", targetLocalId: "prod_studio" },

    // Features implement requirements
    { relationshipTypeKey: "feature_implements_requirement", sourceLocalId: "f_checkout", targetLocalId: "req_payments" },
    { relationshipTypeKey: "feature_implements_requirement", sourceLocalId: "f_sso", targetLocalId: "req_sso" },
    { relationshipTypeKey: "feature_implements_requirement", sourceLocalId: "f_realtime", targetLocalId: "req_realtime" },

    // Tickets part of features
    { relationshipTypeKey: "ticket_part_of_feature", sourceLocalId: "t_checkout_bug", targetLocalId: "f_checkout" },
    { relationshipTypeKey: "ticket_part_of_feature", sourceLocalId: "t_realtime_timeout", targetLocalId: "f_realtime" },
    { relationshipTypeKey: "ticket_part_of_feature", sourceLocalId: "t_sso_edge", targetLocalId: "f_sso" },
    { relationshipTypeKey: "ticket_part_of_feature", sourceLocalId: "t_ui_polish", targetLocalId: "f_darkmode" },

    // Features in sprints
    { relationshipTypeKey: "feature_in_sprint", sourceLocalId: "f_checkout", targetLocalId: "s_sprint1" },
    { relationshipTypeKey: "feature_in_sprint", sourceLocalId: "f_onboarding", targetLocalId: "s_sprint1" },
    { relationshipTypeKey: "feature_in_sprint", sourceLocalId: "f_sso", targetLocalId: "s_sprint2" },
    { relationshipTypeKey: "feature_in_sprint", sourceLocalId: "f_realtime", targetLocalId: "s_sprint2" },
    { relationshipTypeKey: "feature_in_sprint", sourceLocalId: "f_darkmode", targetLocalId: "s_sprint1" },

    // Features in releases
    { relationshipTypeKey: "feature_in_release", sourceLocalId: "f_checkout", targetLocalId: "rel_v1" },
    { relationshipTypeKey: "feature_in_release", sourceLocalId: "f_onboarding", targetLocalId: "rel_v1" },
    { relationshipTypeKey: "feature_in_release", sourceLocalId: "f_darkmode", targetLocalId: "rel_v1" },
    { relationshipTypeKey: "feature_in_release", sourceLocalId: "f_sso", targetLocalId: "rel_v2" },

    // Releases deployed via deployments
    { relationshipTypeKey: "release_deployed_via", sourceLocalId: "rel_v1", targetLocalId: "dep_1" },
    { relationshipTypeKey: "release_deployed_via", sourceLocalId: "rel_v2", targetLocalId: "dep_2" },

    // Deployments to environments
    { relationshipTypeKey: "deployment_to_environment", sourceLocalId: "dep_1", targetLocalId: "env_prod" },
    { relationshipTypeKey: "deployment_to_environment", sourceLocalId: "dep_2", targetLocalId: "env_staging" },

    // Incidents affect services
    { relationshipTypeKey: "incident_affects_service", sourceLocalId: "inc_api", targetLocalId: "svc_api" },
    { relationshipTypeKey: "incident_affects_service", sourceLocalId: "inc_auth", targetLocalId: "svc_auth" },

    // Revenue subscriptions bill customers
    { relationshipTypeKey: "subscription_for_customer", sourceLocalId: "sub_acme", targetLocalId: "c_acme" },
    { relationshipTypeKey: "subscription_for_customer", sourceLocalId: "sub_globex", targetLocalId: "c_globex" },

    // Security controls protect services
    { relationshipTypeKey: "control_protects_service", sourceLocalId: "sec_mfa", targetLocalId: "svc_auth" },
    { relationshipTypeKey: "control_protects_service", sourceLocalId: "sec_encryption", targetLocalId: "svc_api" },
  ];

  const requiredRecordTypeKeys = [
    ...new Set(records.map((r) => r.recordTypeKey)),
  ];
  const requiredRelationshipTypeKeys = [
    ...new Set(relationships.map((r) => r.relationshipTypeKey)),
  ];

  return {
    records,
    relationships,
    requiredRecordTypeKeys,
    requiredRelationshipTypeKeys,
  };
}
