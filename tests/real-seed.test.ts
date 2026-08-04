import { describe, expect, it } from "vitest";
import { buildRealDataset, type WizardContext } from "@/lib/demo/seed";

function ctx(overrides: Partial<WizardContext> = {}): WizardContext {
  return {
    orgName: "Acme",
    people: [
      { name: "Sam", role: "Founder" },
      { name: "Alex", role: "Engineer" },
    ],
    services: ["Web app", "API"],
    hostingProviders: ["vercel", "railway"],
    teamTools: ["sentry", "github", "slack"],
    domainRegistrars: ["spaceship"],
    projects: [],
    features: [{ name: "Checkout", service: "Web app", owner: "Alex" }],
    ...overrides,
  };
}

function rels(dataset: ReturnType<typeof buildRealDataset>, key: string) {
  return dataset.relationships.filter((r) => r.relationshipTypeKey === key);
}

describe("buildRealDataset", () => {
  it("creates a Product anchor named after the org", () => {
    const d = buildRealDataset(ctx());
    const products = d.records.filter((r) => r.recordTypeKey === "product");
    expect(products).toHaveLength(1);
    expect(products[0]!.displayName).toBe("Acme");
  });

  it("creates records for people, services, vendors, and features", () => {
    const d = buildRealDataset(ctx());
    expect(d.records.filter((r) => r.recordTypeKey === "person")).toHaveLength(2);
    expect(d.records.filter((r) => r.recordTypeKey === "service")).toHaveLength(2);
    // 2 hosting + 3 tools + 1 domain
    expect(d.records.filter((r) => r.recordTypeKey === "vendor")).toHaveLength(6);
    expect(d.records.filter((r) => r.recordTypeKey === "feature")).toHaveLength(1);
  });

  it("never duplicates a person — feature owner reuses / creates one canonical node", () => {
    // "Vance" is a feature owner not in the people list, and appears with mixed
    // casing across features. Only ONE Vance person should exist, owning both.
    const d = buildRealDataset(
      ctx({
        people: [{ name: "Sam", role: "Founder" }],
        features: [
          { name: "Checkout", owner: "Vance" },
          { name: "Billing", owner: "vance " },
        ],
      }),
    );
    const vances = d.records.filter(
      (r) => r.recordTypeKey === "person" && /vance/i.test(r.displayName),
    );
    expect(vances).toHaveLength(1);
    const owns = rels(d, "person_owns_feature");
    expect(owns).toHaveLength(2);
    expect(new Set(owns.map((r) => r.sourceLocalId)).size).toBe(1);
  });

  it("dedupes duplicate people, services, and features by normalized name", () => {
    const d = buildRealDataset(
      ctx({
        people: [
          { name: "Sam", role: "Founder" },
          { name: "sam ", role: "CEO" },
        ],
        services: ["API", "api"],
        features: [{ name: "Checkout" }, { name: "checkout " }],
      }),
    );
    expect(d.records.filter((r) => r.recordTypeKey === "person")).toHaveLength(1);
    expect(d.records.filter((r) => r.recordTypeKey === "service")).toHaveLength(1);
    expect(d.records.filter((r) => r.recordTypeKey === "feature")).toHaveLength(1);
  });

  it("round-robins services across hosting vendors", () => {
    const hosting = rels(buildRealDataset(ctx()), "service_hosted_on_vendor");
    expect(hosting).toHaveLength(2);
    // svc_0 (Web app) -> vercel, svc_1 (API) -> railway
    expect(hosting).toContainEqual({
      relationshipTypeKey: "service_hosted_on_vendor",
      sourceLocalId: "svc_0",
      targetLocalId: "v_host_vercel",
    });
    expect(hosting).toContainEqual({
      relationshipTypeKey: "service_hosted_on_vendor",
      sourceLocalId: "svc_1",
      targetLocalId: "v_host_railway",
    });
  });

  it("connects every service to each monitoring tool", () => {
    // sentry is the only Monitoring tool here -> 2 services x 1 monitor = 2
    expect(rels(buildRealDataset(ctx()), "service_monitored_by_vendor")).toHaveLength(2);
  });

  it("links the product to every vendor", () => {
    expect(rels(buildRealDataset(ctx()), "product_uses_vendor")).toHaveLength(6);
  });

  it("links each person to dev/comms/design tools only", () => {
    // github (Dev tools) + slack (Comms) => 2 personal tools x 2 people = 4
    // sentry (Monitoring) is excluded.
    expect(rels(buildRealDataset(ctx()), "person_uses_vendor")).toHaveLength(4);
  });

  it("wires feature ownership, service, and product", () => {
    const d = buildRealDataset(ctx());
    expect(rels(d, "feature_belongs_to_product")).toHaveLength(1);
    expect(rels(d, "feature_in_service")).toContainEqual({
      relationshipTypeKey: "feature_in_service",
      sourceLocalId: "f_0",
      targetLocalId: "svc_0",
    });
    expect(rels(d, "person_owns_feature")).toContainEqual({
      relationshipTypeKey: "person_owns_feature",
      sourceLocalId: "p_1",
      targetLocalId: "f_0",
    });
  });

  it("derives required type keys from the built graph", () => {
    const d = buildRealDataset(ctx());
    expect(d.requiredRecordTypeKeys).toEqual(
      expect.arrayContaining(["product", "person", "service", "vendor", "feature"]),
    );
    expect(d.requiredRelationshipTypeKeys).toEqual(
      expect.arrayContaining(["feature_in_service", "service_hosted_on_vendor"]),
    );
  });

  it("builds the Client → Project → Feature spine from projects", () => {
    const d = buildRealDataset(
      ctx({
        projects: [
          { name: "Car Nodes App", client: "Toyota" },
          { name: "Internal Tool" },
        ],
        features: [
          { name: "3D viewer", project: "Car Nodes App", dependsOn: ["VIN lookup"] },
          { name: "VIN lookup", project: "Car Nodes App" },
        ],
      }),
    );
    // Two products, one customer (Toyota).
    expect(d.records.filter((r) => r.recordTypeKey === "product")).toHaveLength(2);
    const customers = d.records.filter((r) => r.recordTypeKey === "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0]!.displayName).toBe("Toyota");
    // Client → Project edge (Toyota → Car Nodes App = prod_0).
    expect(rels(d, "customer_client_of_product")).toContainEqual({
      relationshipTypeKey: "customer_client_of_product",
      sourceLocalId: "cust_0",
      targetLocalId: "prod_0",
    });
    // Feature belongs to its project's product.
    expect(rels(d, "feature_belongs_to_product")).toContainEqual({
      relationshipTypeKey: "feature_belongs_to_product",
      sourceLocalId: "f_0",
      targetLocalId: "prod_0",
    });
    // Feature → feature dependency (3D viewer depends on VIN lookup).
    expect(rels(d, "feature_depends_on_feature")).toContainEqual({
      relationshipTypeKey: "feature_depends_on_feature",
      sourceLocalId: "f_0",
      targetLocalId: "f_1",
    });
  });

  it("produces a coherent graph even with only people entered", () => {
    const d = buildRealDataset(
      ctx({ services: [], hostingProviders: [], teamTools: [], domainRegistrars: [], features: [] }),
    );
    expect(d.records.filter((r) => r.recordTypeKey === "product")).toHaveLength(1);
    expect(d.records.filter((r) => r.recordTypeKey === "person")).toHaveLength(2);
    expect(d.records.filter((r) => r.recordTypeKey === "vendor")).toHaveLength(0);
  });
});
