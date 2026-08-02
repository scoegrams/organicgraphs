import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { softwarePack } from "@/lib/packs/software";
import type { IndustryPackDef } from "@/lib/packs/types";
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
  /** Product features and how they connect (owner + the service they run in). */
  features: { name: string; service?: string; owner?: string }[];
}

export function emptyWizardContext(): WizardContext {
  return {
    orgName: "Company",
    people: [],
    services: [],
    hostingProviders: [],
    teamTools: [],
    domainRegistrars: [],
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

  // ── Product anchor ──────────────────────────────────────────────────────────
  const productId = "prod_main";
  records.push({
    localId: productId,
    recordTypeKey: "product",
    displayName: ctx.orgName?.trim() || "Company",
  });

  // ── People ──────────────────────────────────────────────────────────────────
  const personIdByName = new Map<string, string>();
  ctx.people.forEach((p, i) => {
    const name = p.name.trim();
    if (!name) return;
    const localId = `p_${i}`;
    personIdByName.set(name, localId);
    records.push({
      localId,
      recordTypeKey: "person",
      displayName: name,
      values: p.role ? { role: p.role } : {},
    });
  });

  // ── Services ──────────────────────────────────────────────────────────────────
  const serviceIdByName = new Map<string, string>();
  ctx.services.forEach((name, i) => {
    const clean = name.trim();
    if (!clean) return;
    const localId = `svc_${i}`;
    serviceIdByName.set(clean, localId);
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
  ctx.features.forEach((f, i) => {
    const name = f.name.trim();
    if (!name) return;
    const localId = `f_${i}`;
    records.push({
      localId,
      recordTypeKey: "feature",
      displayName: name,
      status: "Planned",
      values: { status: "Planned" },
    });
    relationships.push({
      relationshipTypeKey: "feature_belongs_to_product",
      sourceLocalId: localId,
      targetLocalId: productId,
    });
    const svcId = f.service ? serviceIdByName.get(f.service.trim()) : undefined;
    if (svcId) {
      relationships.push({
        relationshipTypeKey: "feature_in_service",
        sourceLocalId: localId,
        targetLocalId: svcId,
      });
    }
    const ownerId = f.owner ? personIdByName.get(f.owner.trim()) : undefined;
    if (ownerId) {
      relationships.push({
        relationshipTypeKey: "person_owns_feature",
        sourceLocalId: ownerId,
        targetLocalId: localId,
      });
    }
  });

  // ── Category-aware vendor wiring ───────────────────────────────────────────────
  const monitoringVendorIds = allVendorRecords
    .filter((v) => cat(v) === "Monitoring")
    .map((v) => v.localId);
  const personalToolVendorIds = allVendorRecords
    .filter((v) => {
      const c = cat(v);
      return c === "Dev tools" || c === "Comms" || c === "Design";
    })
    .map((v) => v.localId);

  // service_hosted_on_vendor — round-robin across hosting vendors
  serviceLocalIds.forEach((svcId, i) => {
    if (hostingVendorRecords.length === 0) return;
    const vendorId = hostingVendorRecords[i % hostingVendorRecords.length]!.localId;
    relationships.push({ relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: svcId, targetLocalId: vendorId });
  });

  // service_monitored_by_vendor — every service → every monitoring tool
  serviceLocalIds.forEach((svcId) => {
    monitoringVendorIds.forEach((vendorId) => {
      relationships.push({ relationshipTypeKey: "service_monitored_by_vendor", sourceLocalId: svcId, targetLocalId: vendorId });
    });
  });

  // product_uses_vendor — product → every vendor
  allVendorRecords.forEach((v) => {
    relationships.push({ relationshipTypeKey: "product_uses_vendor", sourceLocalId: productId, targetLocalId: v.localId });
  });

  // person_uses_vendor — each person → dev / comms / design tools
  [...personIdByName.values()].forEach((personId) => {
    personalToolVendorIds.forEach((vendorId) => {
      relationships.push({ relationshipTypeKey: "person_uses_vendor", sourceLocalId: personId, targetLocalId: vendorId });
    });
  });

  return {
    records,
    relationships,
    requiredRecordTypeKeys: [...new Set(records.map((r) => r.recordTypeKey))],
    requiredRelationshipTypeKeys: [...new Set(relationships.map((r) => r.relationshipTypeKey))],
  };
}

/**
 * Build a personalised SAMPLE (fictional) dataset from wizard answers, layering
 * the user's real services/hosting/tools on top of the stock demo company.
 * If the wizard answers are empty we fall back to the stock demo data.
 */
function buildSampleDataset(ctx: WizardContext): DemoDataset {
  const base = softwareDemoDataset();

  const hasServices = ctx.services.length > 0;
  const hasHosting = ctx.hostingProviders.length > 0;
  const hasTools = ctx.teamTools.length > 0;
  const hasDomain = ctx.domainRegistrars.length > 0;

  // Nothing personalised? Return stock demo as-is.
  if (!hasServices && !hasHosting && !hasTools && !hasDomain) return base;

  // Keep all non-service, non-vendor records from the base dataset.
  const nonServiceRecords = base.records.filter(
    (r) => r.recordTypeKey !== "service" && r.recordTypeKey !== "vendor",
  );
  // Drop vendor-related base relationships; we rebuild them below.
  const baseRelationships = base.relationships.filter(
    (rel) =>
      !["service_hosted_on_vendor", "service_monitored_by_vendor",
        "repository_hosted_on_vendor", "product_uses_vendor", "person_uses_vendor"].includes(
        rel.relationshipTypeKey,
      ),
  );

  const serviceRecords: DemoRecord[] = hasServices
    ? ctx.services.map((name, i) => ({
        localId: `svc_${i}`,
        recordTypeKey: "service",
        displayName: name,
        status: "Healthy",
        values: { status: "Healthy" },
      }))
    : base.records.filter((r) => r.recordTypeKey === "service");

  const serviceLocalIds = serviceRecords.map((r) => r.localId);

  const repoLocalIds = nonServiceRecords
    .filter((r) => r.recordTypeKey === "repository")
    .map((r) => r.localId);

  const hostingVendorRecords: DemoRecord[] = hasHosting
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
    : base.records.filter((r) => r.recordTypeKey === "vendor" && cat(r) === "Hosting");

  const toolVendorRecords: DemoRecord[] = hasTools
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
    : base.records.filter(
        (r) => r.recordTypeKey === "vendor" && cat(r) !== "Hosting" && cat(r) !== "Domain",
      );

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

  const productId = nonServiceRecords.find((r) => r.recordTypeKey === "product")?.localId ?? "prod_studio";
  const personLocalIds = nonServiceRecords
    .filter((r) => r.recordTypeKey === "person")
    .map((r) => r.localId);

  const monitoringVendorIds = allVendorRecords
    .filter((v) => cat(v) === "Monitoring")
    .map((v) => v.localId);
  const sourceControlVendorIds = toolVendorRecords
    .filter((v) => ["GitHub", "GitLab"].includes(v.displayName))
    .map((v) => v.localId);
  const personalToolVendorIds = allVendorRecords
    .filter((v) => {
      const c = cat(v);
      return c === "Dev tools" || c === "Comms" || c === "Design";
    })
    .map((v) => v.localId);

  const hostingRelationships: DemoRelationship[] = serviceLocalIds.flatMap((svcId, i) => {
    if (hostingVendorRecords.length === 0) return [];
    const vendorId = hostingVendorRecords[i % hostingVendorRecords.length]!.localId;
    return [{ relationshipTypeKey: "service_hosted_on_vendor", sourceLocalId: svcId, targetLocalId: vendorId }];
  });

  const monitoringRelationships: DemoRelationship[] = serviceLocalIds.flatMap((svcId) =>
    monitoringVendorIds.map((vendorId) => ({
      relationshipTypeKey: "service_monitored_by_vendor",
      sourceLocalId: svcId,
      targetLocalId: vendorId,
    })),
  );

  const repoHostingRelationships: DemoRelationship[] = repoLocalIds.flatMap((repoId) =>
    sourceControlVendorIds.map((vendorId) => ({
      relationshipTypeKey: "repository_hosted_on_vendor",
      sourceLocalId: repoId,
      targetLocalId: vendorId,
    })),
  );

  const productVendorRelationships: DemoRelationship[] = allVendorRecords.map((v) => ({
    relationshipTypeKey: "product_uses_vendor",
    sourceLocalId: productId,
    targetLocalId: v.localId,
  }));

  const personToolRelationships: DemoRelationship[] = personLocalIds.flatMap((personId) =>
    personalToolVendorIds.map((vendorId) => ({
      relationshipTypeKey: "person_uses_vendor",
      sourceLocalId: personId,
      targetLocalId: vendorId,
    })),
  );

  const records = [...nonServiceRecords, ...serviceRecords, ...allVendorRecords];

  const relationships = [
    ...baseRelationships,
    ...hostingRelationships,
    ...monitoringRelationships,
    ...repoHostingRelationships,
    ...productVendorRelationships,
    ...personToolRelationships,
  ];

  const requiredRelationshipTypeKeys = [
    ...base.requiredRelationshipTypeKeys,
    "service_monitored_by_vendor",
    "repository_hosted_on_vendor",
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    records,
    relationships,
    requiredRecordTypeKeys: base.requiredRecordTypeKeys,
    requiredRelationshipTypeKeys,
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

    return { recordsCreated, relationshipsCreated };
  });
}

/** Seed the company's REAL graph from wizard answers (people, apps, hosts, features). */
export async function seedRealFromWizard(
  organizationId: string,
  ctx: WizardContext,
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  return seedDataset(organizationId, softwarePack, buildRealDataset(ctx));
}

/** Seed the fictional "sample company" for exploration (optionally personalised). */
export async function seedSampleCompany(
  organizationId: string,
  ctx: WizardContext = emptyWizardContext(),
): Promise<{ recordsCreated: number; relationshipsCreated: number }> {
  return seedDataset(organizationId, softwarePack, buildSampleDataset(ctx));
}
