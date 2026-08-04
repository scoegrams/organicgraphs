/**
 * A minimal Software-company demo — just enough to show the essential graph
 * structure (Client → Product → Feature, team members, vendors) without
 * flooding the graph with noise.
 *
 * ~10 nodes, ~14 relationships. Idempotent: the seeder upserts by slug so
 * running this twice is safe, and it appends cleanly to an existing graph.
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
    // Team
    { localId: "p_sam",   recordTypeKey: "person",   displayName: "Sam Ortiz",    values: { role: "Founder",          email: "sam@devstudio.app" } },
    { localId: "p_priya", recordTypeKey: "person",   displayName: "Priya Nair",   values: { role: "Engineering lead", email: "priya@devstudio.app" } },
    { localId: "p_alex",  recordTypeKey: "person",   displayName: "Alex Rivera",  values: { role: "Engineer",         email: "alex@devstudio.app" } },

    // Customer
    { localId: "c_acme",  recordTypeKey: "customer", displayName: "Acme Corp",    values: { email: "ops@acme.example" } },

    // Product
    { localId: "prod",    recordTypeKey: "product",  displayName: "Developer Studio" },

    // Vendors (only the essentials)
    { localId: "v_vercel", recordTypeKey: "vendor",  displayName: "Vercel",  status: "Active", values: { category: "Hosting",   cost: 20,  cycle: "Monthly",    url: "https://vercel.com",  status: "Active" } },
    { localId: "v_github", recordTypeKey: "vendor",  displayName: "GitHub",  status: "Active", values: { category: "Dev tools", cost: 44,  cycle: "Monthly",    url: "https://github.com",  status: "Active" } },
    { localId: "v_stripe", recordTypeKey: "vendor",  displayName: "Stripe",  status: "Active", values: { category: "Payments",  cost: 0,   cycle: "Usage-based", url: "https://stripe.com", status: "Active" } },

    // Features (the work)
    { localId: "f_checkout",   recordTypeKey: "feature", displayName: "Checkout redesign", status: "In development", values: { status: "In development" } },
    { localId: "f_onboarding", recordTypeKey: "feature", displayName: "Onboarding v2",     status: "Review",         values: { status: "Review" } },
    { localId: "f_sso",        recordTypeKey: "feature", displayName: "SSO / SAML",        status: "Planned",        values: { status: "Planned" } },
  ];

  const relationships: DemoRelationship[] = [
    // Client → Product spine
    { relationshipTypeKey: "customer_client_of_product",  sourceLocalId: "c_acme",  targetLocalId: "prod" },

    // Team on product
    { relationshipTypeKey: "person_member_of_product", sourceLocalId: "p_sam",   targetLocalId: "prod" },
    { relationshipTypeKey: "person_member_of_product", sourceLocalId: "p_priya", targetLocalId: "prod" },
    { relationshipTypeKey: "person_member_of_product", sourceLocalId: "p_alex",  targetLocalId: "prod" },

    // Product → vendors
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod", targetLocalId: "v_vercel" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod", targetLocalId: "v_github" },
    { relationshipTypeKey: "product_uses_vendor", sourceLocalId: "prod", targetLocalId: "v_stripe" },

    // Features belong to product
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_checkout",   targetLocalId: "prod" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_onboarding", targetLocalId: "prod" },
    { relationshipTypeKey: "feature_belongs_to_product", sourceLocalId: "f_sso",        targetLocalId: "prod" },

    // Feature ownership
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_alex",  targetLocalId: "f_checkout" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_alex",  targetLocalId: "f_onboarding" },
    { relationshipTypeKey: "person_owns_feature", sourceLocalId: "p_priya", targetLocalId: "f_sso" },

    // Engineers use dev tools
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_sam",   targetLocalId: "v_github" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_priya", targetLocalId: "v_github" },
    { relationshipTypeKey: "person_uses_vendor", sourceLocalId: "p_alex",  targetLocalId: "v_github" },
  ];

  const requiredRecordTypeKeys = [...new Set(records.map((r) => r.recordTypeKey))];
  const requiredRelationshipTypeKeys = [...new Set(relationships.map((r) => r.relationshipTypeKey))];

  return { records, relationships, requiredRecordTypeKeys, requiredRelationshipTypeKeys };
}
