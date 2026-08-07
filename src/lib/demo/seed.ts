import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { softwarePack } from "@/lib/packs/software";
import type { IndustryPackDef } from "@/lib/packs/types";
import { reconcileInference } from "@/lib/graph/inference/apply";
import type { Sensitivity } from "@/lib/meta-model";
import { softwareDemoDataset, type DemoDataset, type DemoRecord, type DemoRelationship } from "./software-demo";
import {
  HOSTING_PROVIDER_META,
  TEAM_TOOL_META,
  DOMAIN_REGISTRAR_META,
  type HostingProvider,
  type TeamTool,
  type DomainRegistrar,
  type WizardAnswers,
} from "@/lib/wizard";

/** Wizard answers the seeder uses to build a company's real graph. */
export interface WizardContext {
  /** The organization name, used to name the anchor Product node. */
  orgName: string;
  /** Employees captured in the wizard. */
  people: { name: string; role?: string }[];
  /** Service / app names typed by the user, e.g. ["Web app", "API", "Mobile"]. */
  services: string[];
  /** Hosting provider keys selected in the wizard, e.g. ["vercel", "railway"]. */
  hostingProviders: HostingProvider[];
  /** SaaS tool keys selected in the wizard, e.g. ["github", "linear", "sentry"]. */
  teamTools: TeamTool[];
  /** Domain registrar / DNS keys selected in the wizard, e.g. ["spaceship", "cloudflare"]. */
  domainRegistrars: DomainRegistrar[];
  /** Projects / apps this company builds; each becomes a Product, optionally for a client. */
  projects: { name: string; client?: string }[];
  /** Product features and how they connect (project, owner, service, dependencies). */
  features: {
    name: string;
    project?: string;
    service?: string;
    owner?: string;
    dependsOn?: string[];
  }[];
}

export function emptyWizardContext(): WizardContext {
  return {
    orgName: "Company",
    people: [],
    services: [],
    hostingProviders: [],
    teamTools: [],
    domainRegistrars: [],
    projects: [],
    features: [],
  };
}

/** Map validated wizard answers + the org name into a seeder WizardContext. */
export function wizardContextFromAnswers(
  orgName: string,
  answers: WizardAnswers,
): WizardContext {
  return {
    orgName,
    people: answers.participants.people,
    services: answers.valueAndWork.services,
    hostingProviders: answers.systems.hostingProviders,
    teamTools: answers.systems.teamTools,
    domainRegistrars: answers.systems.domainRegistrars,
    projects: answers.valueAndWork.projects,
    features: answers.valueAndWork.features,
  };
}

function sens(s: string | undefined): Sensitivity {
  return (s as Sensitivity) ?? "GENERAL";
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "record"
  );
}

function cat(v: DemoRecord): unknown {
  return (v.values as Record<string, unknown>)?.["category"];
}

/**
 * Build the company's REAL graph purely from wizard answers — no fiction.
 * A single Product node (the org name) anchors vendors and features so the
 * graph stays connected even before it is rich.
 *
 * Connection rules (category-aware, same semantics as the sample seeder):
 *  - service_hosted_on_vendor    — each service → a hosting vendor (round-robin)
 *  - service_monitored_by_vendor — each service → every monitoring tool
 *  - product_uses_vendor         — product → every vendor (top-level dependency)
 *  - person_uses_vendor          — each person → dev / comms / design tools
 *  - feature_belongs_to_product  — each feature → the product anchor
 *  - feature_in_service          — feature → the service it runs in
 *  - person_owns_feature         — the named owner → their feature
 */
export function buildRealDataset(ctx: WizardContext): DemoDataset {
  const records: DemoRecord[] = [];
  const relationships: DemoRelationship[] = [];

  // ── Projects (Products) + Clients (Customers) ────────────────────────────────
  // Each named project becomes a Product; its client becomes a Customer linked
  // via customer_client_of_product. If no projects are named, a single Product
  // named after the org anchors everything (backwards compatible).
  // All name→localId maps are keyed by a normalized (trimmed, lower-cased) name
  // so a person/service/project referenced elsewhere resolves to the SAME node
  // regardless of casing or spacing — this is what prevents "two Vance" records.
  const norm = (s: string) => s.trim().toLowerCase();

  const productIdByName = new Map<string, string>();
  const customerIdByName = new Map<string, string>();
  const namedProjects = (ctx.projects ?? []).filter((p) => p.name.trim());

  if (namedProjects.length > 0) {
    namedProjects.forEach((p, i) => {
      const name = p.name.trim();
      if (productIdByName.has(norm(name))) return; // dedup duplicate project names
      const localId = `prod_${i}`;
      productIdByName.set(norm(name), localId);
      records.push({ localId, recordTypeKey: "product", displayName: name });

      const client = p.client?.trim();
      if (client) {
        let custId = customerIdByName.get(norm(client));
        if (!custId) {
          custId = `cust_${customerIdByName.size}`;
          customerIdByName.set(norm(client), custId);
          records.push({ localId: custId, recordTypeKey: "customer", displayName: client });
        }
        relationships.push({
          relationshipTypeKey: "customer_client_of_product",
          sourceLocalId: custId,
          targetLocalId: localId,
        });
      }
    });
  } else {
    const localId = "prod_main";
    const name = ctx.orgName?.trim() || "Company";
    productIdByName.set(norm(name), localId);
    records.push({ localId, recordTypeKey: "product", displayName: name });
  }

  // The anchor product carries org-level vendor dependencies.
  const productId = records.find((r) => r.recordTypeKey === "product")!.localId;

  // ── People ──────────────────────────────────────────────────────────────────
  const personIdByName = new Map<string, string>();
  ctx.people.forEach((p, i) => {
    const name = p.name.trim();
    if (!name || personIdByName.has(norm(name))) return; // dedup duplicate people
    const localId = `p_${i}`;
    personIdByName.set(norm(name), localId);
    records.push({
      localId,
      recordTypeKey: "person",
      displayName: name,
      values: p.role ? { role: p.role } : {},
    });
  });

  // Resolve an owner name to a Person, creating one on demand and reusing it so
  // an owner typed only on a feature never spawns a second Person node.
  const ensurePerson = (raw: string | undefined): string | undefined => {
    const name = raw?.trim();
    if (!name) return undefined;
    const existing = personIdByName.get(norm(name));
    if (existing) return existing;
    const localId = `p_owner_${personIdByName.size}`;
    personIdByName.set(norm(name), localId);
    records.push({ localId, recordTypeKey: "person", displayName: name, values: {} });
    return localId;
  };

  // ── Services ──────────────────────────────────────────────────────────────────
  const serviceIdByName = new Map<string, string>();
  ctx.services.forEach((name, i) => {
    const clean = name.trim();
    if (!clean || serviceIdByName.has(norm(clean))) return; // dedup duplicate services
    const localId = `svc_${i}`;
    serviceIdByName.set(norm(clean), localId);
    records.push({
      localId,
      recordTypeKey: "service",
      displayName: clean,
      status: "Healthy",
      values: { status: "Healthy" },
    });
  });
  const serviceLocalIds = [...serviceIdByName.values()];

  // ── Vendors: hosting ─────────────────────────────────────────────────────────
  const hostingVendorRecords: DemoRecord[] = ctx.hostingProviders.map((key) => {
    const m = HOSTING_PROVIDER_META[key];
    return {
      localId: `v_host_${key}`,
      recordTypeKey: "vendor",
      displayName: m.name,
      status: "Active",
      values: { category: "Hosting", cost: m.cost, cycle: m.cycle, ...(m.url ? { url: m.url } : {}), status: "Active" },
    };
  });

  // ── Vendors: tools ───────────────────────────────────────────────────────────
  const toolVendorRecords: DemoRecord[] = ctx.teamTools.map((key) => {
    const m = TEAM_TOOL_META[key];
    return {
      localId: `v_tool_${key}`,
      recordTypeKey: "vendor",
      displayName: m.name,
      status: "Active",
      values: { category: m.category, cost: m.cost, cycle: m.cycle, url: m.url, status: "Active" },
    };
  });

  // ── Vendors: domain / DNS ─────────────────────────────────────────────────────
  const domainVendorRecords: DemoRecord[] = ctx.domainRegistrars.map((key) => {
    const m = DOMAIN_REGISTRAR_META[key];
    return {
      localId: `v_domain_${key}`,
      recordTypeKey: "vendor",
      displayName: m.name,
      status: "Active",
      values: { category: "Domain", cost: m.cost, cycle: m.cycle, url: m.url, status: "Active" },
    };
  });

  const allVendorRecords = [...hostingVendorRecords, ...toolVendorRecords, ...domainVendorRecords];
  records.push(...allVendorRecords);

  // ── Features ──────────────────────────────────────────────────────────────────
  const featureIdByName = new Map<string, string>();
  ctx.features.forEach((f, i) => {
    const name = f.name.trim();
    if (!name || featureIdByName.has(norm(name))) return; // dedup duplicate features
    const localId = `f_${i}`;
    featureIdByName.set(norm(name), localId);
    records.push({
      localId,
      recordTypeKey: "feature",
      displayName: name,
      status: "Planned",
      values: { status: "Planned" },
    });
    // Belongs to its named project's product, else the anchor product.
    const prodId =
      (f.project ? productIdByName.get(norm(f.project)) : undefined) ?? productId;
    relationships.push({
      relationshipTypeKey: "feature_belongs_to_product",
      sourceLocalId: localId,
      targetLocalId: prodId,
    });
    const svcId = f.service ? serviceIdByName.get(norm(f.service)) : undefined;
    if (svcId) {
      relationships.push({
        relationshipTypeKey: "feature_in_service",
        sourceLocalId: localId,
        targetLocalId: svcId,
      });
    }
    const ownerId = ensurePerson(f.owner);
    if (ownerId) {
      relationships.push({
        relationshipTypeKey: "person_owns_feature",
        sourceLocalId: ownerId,
        targetLocalId: localId,
      });
    }
  });

  // ── Feature → feature dependencies (wired after all features exist) ───────────
  ctx.features.forEach((f) => {
    const fromId = featureIdByName.get(norm(f.name));
    if (!fromId) return;
    for (const dep of f.dependsOn ?? []) {
      const toId = featureIdByName.get(norm(dep));
      if (toId && toId !== fromId) {
        relationships.push({
          relationshipTypeKey: "feature_depends_on_feature",
          sourceLocalId: fromId,
          targetLocalId: toId,
        });
      }
    }
  });

  // ── Category-aware vendor wiring ─────────────────────────────────────────
  // Only auto-wire relationships that are structurally true and not ambiguous:
  //   service → hosting vendor  (infra fact — the service literally runs there)
  //   product → infra vendors   (payments, email, domain, auth power the product)
  //
  // Intentionally NOT auto-wired (too noisy, users must connect manually):
  //   person → dev tools / comms / design  (not every person uses every tool)
  //   service → monitoring tools           (not every service has the same monitors)
  // These vendors still appear as nodes and can be linked from the graph builder.

  const infraVendorIds = allVendorRecords
    .filter((v) => {
      const c = cat(v);
      return c === "Hosting" || c === "Payments" || c === "Email" ||
             c === "Domain" || c === "Auth";
    })
    .map((v) => v.localId);

  // service_hosted_on_vendor — round-robin across hosting vendors
  serviceLocalIds.forEach((svcId, i) => {
    if (hostingVendorRecords.length === 0) return;
    const vendorId = hostingVendorRecords[i % hostingVendorRecords.length]!.localId;
    relationships.push({ relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: svcId, targetLocalId: vendorId });
  });

  // product_uses_vendor — only infra vendors (hosting, payments, email, domain, auth)
  // Dev tools / comms / design tools exist as nodes but aren't auto-wired to the product.
  infraVendorIds.forEach((vendorId) => {
    relationships.push({ relationshipTypeKey: "product_uses_vendor", sourceLocalId: productId, targetLocalId: vendorId });
  });

  return {
    records,
    relationships,
    requiredRecordTypeKeys: [...new Set(records.map((r) => r.recordTypeKey))],
    requiredRelationshipTypeKeys: [...new Set(relationships.map((r) => r.relationshipTypeKey))],
  };
}

/**
 * Build a personalised SAMPLE dataset from wizard answers, replacing the demo's
 * placeholder vendors/services with the user's real choices if they provided them.
 * Falls back to the stock demo when no wizard answers exist.
 */
function buildSampleDataset(ctx: WizardContext): DemoDataset {
  const base = softwareDemoDataset();

  const hasHosting = ctx.hostingProviders.length > 0;
  const hasTools = ctx.teamTools.length > 0;

  // Nothing personalised → return stock demo as-is.
  if (!hasHosting && !hasTools) return base;

  // Replace demo vendors with the user's real choices.
  const nonVendorRecords = base.records.filter((r) => r.recordTypeKey !== "vendor");
  const nonVendorRels = base.relationships.filter(
    (r) =>
      !["product_uses_vendor", "person_uses_vendor", "service_hosted_on_vendor",
        "service_monitored_by_vendor", "repository_hosted_on_vendor"].includes(r.relationshipTypeKey),
  );

  const hostingVendors: DemoRecord[] = hasHosting
    ? ctx.hostingProviders.map((key) => {
        const m = HOSTING_PROVIDER_META[key];
        return {
          localId: `v_host_${key}`,
          recordTypeKey: "vendor",
          displayName: m.name,
          status: "Active",
          values: { category: "Hosting", cost: m.cost, cycle: m.cycle, ...(m.url ? { url: m.url } : {}), status: "Active" },
        };
      })
    : [];

  const toolVendors: DemoRecord[] = hasTools
    ? ctx.teamTools.map((key) => {
        const m = TEAM_TOOL_META[key];
        return {
          localId: `v_tool_${key}`,
          recordTypeKey: "vendor",
          displayName: m.name,
          status: "Active",
          values: { category: m.category, cost: m.cost, cycle: m.cycle, url: m.url, status: "Active" },
        };
      })
    : [];

  const allVendors = [...hostingVendors, ...toolVendors];

  const productId = base.records.find((r) => r.recordTypeKey === "product")?.localId ?? "prod";
  const personIds = base.records
    .filter((r) => r.recordTypeKey === "person")
    .map((r) => r.localId);

  const devToolIds = allVendors
    .filter((v) => (v.values as Record<string, unknown>)?.category === "Dev tools")
    .map((v) => v.localId);
  const hostingIds = allVendors
    .filter((v) => (v.values as Record<string, unknown>)?.category === "Hosting")
    .map((v) => v.localId);

  const newRels: DemoRelationship[] = [
    ...allVendors.map((v) => ({
      relationshipTypeKey: "product_uses_vendor",
      sourceLocalId: productId,
      targetLocalId: v.localId,
    })),
    ...personIds.flatMap((personId) =>
      devToolIds.map((vendorId) => ({
        relationshipTypeKey: "person_uses_vendor",
        sourceLocalId: personId,
        targetLocalId: vendorId,
      })),
    ),
    // If the user has services, host the first one on the first hosting provider.
    ...(ctx.services.length > 0 && hostingIds.length > 0
      ? [{ relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: "svc_0", targetLocalId: hostingIds[0]! }]
      : []),
  ];

  const records = [...nonVendorRecords, ...allVendors];
  const relationships = [...nonVendorRels, ...newRels];

  return {
    records,
    relationships,
    requiredRecordTypeKeys: [...new Set(records.map((r) => r.recordTypeKey))],
    requiredRelationshipTypeKeys: [...new Set(relationships.map((r) => r.relationshipTypeKey))],
  };
}

/**
 * Ensure the record/relationship types a dataset needs exist on the org, then
 * insert its records and relationships. Idempotent: records upsert by
 * (org, type, slug); relationships are created only if not already present.
 * Works on workspaces generated before a type existed by upserting the
 * required definitions from the pack.
 */
async function seedDataset(
  organizationId: string,
  pack: IndustryPackDef,
  dataset: DemoDataset,
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  const rtByKey = new Map(pack.recordTypes.map((rt) => [rt.key, rt]));
  const relByKey = new Map(pack.relationshipTypes.map((rel) => [rel.key, rel]));

  return prisma.$transaction(async (tx) => {
    // 1. Ensure required record types exist.
    for (const key of dataset.requiredRecordTypeKeys) {
      const def = rtByKey.get(key);
      if (!def) continue;
      await tx.recordTypeDefinition.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: {
          organizationId,
          key,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          sensitivity: sens(def.sensitivity),
          archivable: def.archivable ?? true,
          fields: (def.fields ?? []) as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: def.name,
          fields: (def.fields ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // 2. Ensure required relationship types exist.
    for (const key of dataset.requiredRelationshipTypeKeys) {
      const def = relByKey.get(key);
      if (!def) continue;
      await tx.relationshipTypeDefinition.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: {
          organizationId,
          key,
          sourceTypeKey: def.sourceTypeKey,
          targetTypeKey: def.targetTypeKey,
          forwardLabel: def.forwardLabel,
          reverseLabel: def.reverseLabel,
          cardinality: def.cardinality ?? "many_to_many",
          required: def.required ?? false,
          sensitivity: sens(def.sensitivity),
          supportsValidity: def.supportsValidity ?? false,
        },
        update: {
          forwardLabel: def.forwardLabel,
          reverseLabel: def.reverseLabel,
        },
      });
    }

    // 3. Upsert records; remember local→db id mapping.
    const idByLocal = new Map<string, string>();
    let recordsCreated = 0;
    for (const r of dataset.records) {
      const rtDef = rtByKey.get(r.recordTypeKey);
      const slug = slugify(r.displayName);
      const existing = await tx.record.findUnique({
        where: {
          organizationId_recordTypeKey_slug: {
            organizationId,
            recordTypeKey: r.recordTypeKey,
            slug,
          },
        },
        select: { id: true },
      });
      const rtRow = await tx.recordTypeDefinition.findUnique({
        where: { organizationId_key: { organizationId, key: r.recordTypeKey } },
        select: { id: true },
      });
      if (!rtRow) continue;

      if (existing) {
        await tx.record.update({
          where: { id: existing.id },
          data: {
            displayName: r.displayName,
            status: r.status ?? null,
            values: (r.values ?? {}) as unknown as Prisma.InputJsonValue,
          },
        });
        idByLocal.set(r.localId, existing.id);
      } else {
        const created = await tx.record.create({
          data: {
            organizationId,
            recordTypeId: rtRow.id,
            recordTypeKey: r.recordTypeKey,
            displayName: r.displayName,
            slug,
            status: r.status ?? null,
            sensitivity: sens(rtDef?.sensitivity),
            values: (r.values ?? {}) as unknown as Prisma.InputJsonValue,
            reviewStatus: "reviewed",
          },
          select: { id: true },
        });
        idByLocal.set(r.localId, created.id);
        recordsCreated++;
      }
    }

    // 4. Create relationships that don't already exist.
    const existingRels = await tx.relationship.findMany({
      where: { organizationId },
      select: { relationshipTypeKey: true, sourceId: true, targetId: true },
    });
    const relSet = new Set(
      existingRels.map((r) => `${r.relationshipTypeKey}|${r.sourceId}|${r.targetId}`),
    );

    let relationshipsCreated = 0;
    for (const rel of dataset.relationships) {
      const sourceId = idByLocal.get(rel.sourceLocalId);
      const targetId = idByLocal.get(rel.targetLocalId);
      if (!sourceId || !targetId) continue;
      const sig = `${rel.relationshipTypeKey}|${sourceId}|${targetId}`;
      if (relSet.has(sig)) continue;
      await tx.relationship.create({
        data: {
          organizationId,
          relationshipTypeKey: rel.relationshipTypeKey,
          sourceId,
          targetId,
          reviewStatus: "reviewed",
          sourceAttribution: "wizard",
        },
      });
      relSet.add(sig);
      relationshipsCreated++;
    }

    // The dataset above states only what the user actually told us. Everything
    // that follows from those facts is drawn here, so a freshly seeded org
    // arrives densely and defensibly connected rather than as a flat list.
    const inference = await reconcileInference(tx, organizationId, {
      packKey: pack.key,
    });

    return {
      recordsCreated,
      relationshipsCreated: relationshipsCreated + inference.created,
    };
  });
}

/** Seed the company's REAL graph from wizard answers (people, apps, hosts, features). */
export async function seedRealFromWizard(
  organizationId: string,
  ctx: WizardContext,
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  return seedDataset(organizationId, softwarePack, buildRealDataset(ctx));
}

/**
 * Build a restaurant's real graph from wizard answers.
 *
 * Canonical hierarchy:
 *   Location → Team → Staff → Dish (chef_owns_dish)
 *   Dish → Menu → Location
 *   Supplier → Ingredient ← Dish
 *   Location → Vendor (operational software)
 *
 * Staff are auto-grouped into functional teams (Kitchen, Front of house,
 * Management) so the graph shows: Location → Team → individual Staff members
 * rather than a flat list of people hanging directly off the location.
 */
export function buildRestaurantDataset(
  orgName: string,
  answers: WizardAnswers,
): DemoDataset {
  const records: DemoRecord[] = [];
  const relationships: DemoRelationship[] = [];
  const norm = (s: string) => s.trim().toLowerCase();

  // ── Locations ────────────────────────────────────────────────────────────────
  const locationIdByName = new Map<string, string>();
  (answers.organization.locations ?? []).forEach((name, i) => {
    const clean = name.trim();
    if (!clean || locationIdByName.has(norm(clean))) return;
    const localId = `loc_${i}`;
    locationIdByName.set(norm(clean), localId);
    records.push({ localId, recordTypeKey: "location", displayName: clean });
  });
  if (locationIdByName.size === 0) {
    const name = orgName.trim() || "Main location";
    locationIdByName.set(norm(name), "loc_main");
    records.push({ localId: "loc_main", recordTypeKey: "location", displayName: name });
  }
  const locationIds = [...locationIdByName.values()];

  // ── Staff + Team auto-grouping ─────────────────────────────────────────────
  // Roles that belong to each functional team.
  const KITCHEN_ROLES = new Set([
    "head chef", "sous chef", "line cook", "pastry chef", "sommelier",
  ]);
  const FOH_ROLES = new Set([
    "server", "bartender", "host", "expeditor",
  ]);
  const MGMT_ROLES = new Set([
    "owner", "general manager",
  ]);

  function teamTypeForRole(role: string | undefined): string | null {
    const r = role?.trim().toLowerCase() ?? "";
    if (KITCHEN_ROLES.has(r)) return "Kitchen";
    if (FOH_ROLES.has(r)) return "Front of house";
    if (MGMT_ROLES.has(r)) return "Management";
    return null;
  }

  // Create team nodes (only the ones actually needed for the captured staff).
  const teamIdByType = new Map<string, string>();
  function ensureTeam(type: string): string {
    const existing = teamIdByType.get(type);
    if (existing) return existing;
    const localId = `team_${teamIdByType.size}`;
    teamIdByType.set(type, localId);
    records.push({
      localId,
      recordTypeKey: "team",
      displayName: `${type} team`,
      values: { type },
    });
    // Link team to every location.
    for (const locId of locationIds) {
      relationships.push({
        relationshipTypeKey: "team_at_location",
        sourceLocalId: localId,
        targetLocalId: locId,
      });
    }
    return localId;
  }

  const staffIdByName = new Map<string, string>();
  (answers.participants.people ?? []).forEach((p, i) => {
    const name = p.name.trim();
    if (!name || staffIdByName.has(norm(name))) return;
    const localId = `staff_${i}`;
    staffIdByName.set(norm(name), localId);
    records.push({
      localId,
      recordTypeKey: "staff",
      displayName: name,
      values: p.role ? { role: p.role } : {},
    });
    // staff → team
    const teamType = teamTypeForRole(p.role);
    if (teamType) {
      const teamId = ensureTeam(teamType);
      relationships.push({
        relationshipTypeKey: "staff_in_team",
        sourceLocalId: localId,
        targetLocalId: teamId,
      });
    } else {
      // Staff with unrecognised roles link directly to locations.
      for (const locId of locationIds) {
        relationships.push({
          relationshipTypeKey: "staff_works_at",
          sourceLocalId: localId,
          targetLocalId: locId,
        });
      }
    }
  });

  // Resolve a chef name on demand.
  const ensureStaff = (raw: string | undefined): string | undefined => {
    const name = raw?.trim();
    if (!name) return undefined;
    const existing = staffIdByName.get(norm(name));
    if (existing) return existing;
    const localId = `staff_chef_${staffIdByName.size}`;
    staffIdByName.set(norm(name), localId);
    records.push({ localId, recordTypeKey: "staff", displayName: name, values: { role: "Head chef" } });
    const kitchenId = ensureTeam("Kitchen");
    relationships.push({ relationshipTypeKey: "staff_in_team", sourceLocalId: localId, targetLocalId: kitchenId });
    return localId;
  };

  // ── Menus ─────────────────────────────────────────────────────────────────
  const menuIdByName = new Map<string, string>();
  (answers.valueAndWork.projects ?? []).forEach((p, i) => {
    const name = p.name.trim();
    if (!name || menuIdByName.has(norm(name))) return;
    const localId = `menu_${i}`;
    menuIdByName.set(norm(name), localId);
    records.push({
      localId,
      recordTypeKey: "menu",
      displayName: name,
      status: "Active",
      values: p.client ? { kind: p.client, status: "Active" } : { status: "Active" },
    });
    for (const locId of locationIds) {
      relationships.push({ relationshipTypeKey: "menu_at_location", sourceLocalId: localId, targetLocalId: locId });
    }
  });

  // ── Dishes ─────────────────────────────────────────────────────────────────
  (answers.valueAndWork.features ?? []).forEach((f, i) => {
    const name = f.name.trim();
    if (!name) return;
    const localId = `dish_${i}`;
    records.push({
      localId,
      recordTypeKey: "dish",
      displayName: name,
      status: "Live",
      values: { status: "Live", ...(f.service ? { category: f.service } : {}) },
    });
    const menuId = f.project ? menuIdByName.get(norm(f.project)) : undefined;
    if (menuId) {
      relationships.push({ relationshipTypeKey: "dish_on_menu", sourceLocalId: localId, targetLocalId: menuId });
    }
    const chefId = ensureStaff(f.owner);
    if (chefId) {
      relationships.push({ relationshipTypeKey: "chef_owns_dish", sourceLocalId: chefId, targetLocalId: localId });
    }
  });

  // ── Suppliers ─────────────────────────────────────────────────────────────
  (answers.restaurant.suppliers ?? []).forEach((s, i) => {
    const name = s.name.trim();
    if (!name) return;
    records.push({
      localId: `sup_${i}`,
      recordTypeKey: "supplier",
      displayName: name,
      status: "Active",
      values: { status: "Active", ...(s.category ? { category: s.category } : {}) },
    });
  });

  // ── Operational vendors (Toast, OpenTable, etc.) ──────────────────────────
  // All lumped together — each gets a vendor node linked to every location.
  (answers.restaurant.operationalVendors ?? []).forEach((v, i) => {
    const name = v.name.trim();
    if (!name) return;
    const localId = `op_vendor_${i}`;
    records.push({
      localId,
      recordTypeKey: "vendor",
      displayName: name,
      status: "Active",
      values: { status: "Active", ...(v.category ? { category: v.category } : {}) },
    });
    for (const locId of locationIds) {
      relationships.push({ relationshipTypeKey: "location_uses_vendor", sourceLocalId: locId, targetLocalId: localId });
    }
  });

  return {
    records,
    relationships,
    requiredRecordTypeKeys: [...new Set(records.map((r) => r.recordTypeKey))],
    requiredRelationshipTypeKeys: [...new Set(relationships.map((r) => r.relationshipTypeKey))],
  };
}

/** Seed a restaurant's real graph from wizard answers. */
export async function seedRestaurantFromWizard(
  organizationId: string,
  orgName: string,
  answers: WizardAnswers,
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  const { restaurantPack } = await import("@/lib/packs/restaurant");
  return seedDataset(organizationId, restaurantPack, buildRestaurantDataset(orgName, answers));
}

/** Seed the fictional "sample company" for exploration (optionally personalised). */
export async function seedSampleCompany(
  organizationId: string,
  ctx: WizardContext = emptyWizardContext(),
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  return seedDataset(organizationId, softwarePack, buildSampleDataset(ctx));
}
