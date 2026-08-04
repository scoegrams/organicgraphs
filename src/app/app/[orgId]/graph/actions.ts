"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import type { Sensitivity } from "@/lib/meta-model";
import { fieldsFromJson } from "@/lib/obsidian-export";
import { generateProposals } from "@/lib/graph/ai-fill";
import type { GraphSchema, ProposalSet } from "@/lib/graph/proposals";
import {
  findCanonicalRecord,
  findNearDuplicates,
  fuzzyFindRecords,
  mergeRecords,
  type DuplicatePair,
  type FuzzyHit,
} from "@/lib/graph/fuzzy";
import { brainFanOut } from "@/lib/graph/brain-link";
import { softwarePack } from "@/lib/packs/software";

export interface NewRecordConnection {
  relationshipTypeKey: string;
  /** Direction relative to the new record: it is the source or the target. */
  direction: "outgoing" | "incoming";
  otherId: string;
}

export interface NewRecordInput {
  recordTypeKey: string;
  displayName: string;
  values: Record<string, unknown>;
  connections: NewRecordConnection[];
  /** When set (from autocomplete pick), force-reuse this record id. */
  existingId?: string;
}

export type CreateRecordResult = {
  id?: string;
  error?: string;
  /** True when we reused an existing near-match instead of inserting. */
  reused?: boolean;
  matchedName?: string;
};

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

/**
 * Create a single record and connect it to EXISTING records only. Connections
 * reference other records by id (chosen from a picker in the UI), so the graph
 * reuses canonical nodes instead of spawning duplicates. Every write carries
 * provenance (sourceAttribution "manual") and is tenant- and role-guarded.
 */
export async function createRecord(
  orgId: string,
  input: NewRecordInput,
): Promise<CreateRecordResult> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to add records." };
  }

  const displayName = input.displayName?.trim();
  if (!displayName) return { error: "Give the record a name." };

  const rtDef = await prisma.recordTypeDefinition.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: input.recordTypeKey } },
  });
  if (!rtDef) return { error: "Unknown record type." };

  // Explicit pick from autocomplete, else fuzzy reuse ("Vance" ≈ "vance ").
  let reusedHit: FuzzyHit | null = null;
  if (input.existingId) {
    const existing = await prisma.record.findFirst({
      where: {
        id: input.existingId,
        organizationId: orgId,
        recordTypeKey: input.recordTypeKey,
        archived: false,
      },
      select: { id: true, displayName: true, recordTypeKey: true },
    });
    if (existing) {
      reusedHit = {
        id: existing.id,
        displayName: existing.displayName,
        recordTypeKey: existing.recordTypeKey,
        score: 1,
      };
    }
  }
  if (!reusedHit) {
    try {
      reusedHit = await findCanonicalRecord(
        orgId,
        input.recordTypeKey,
        displayName,
      );
    } catch {
      // Extension may not be ready yet — fall through to create.
    }
  }

  try {
    const newId = await prisma.$transaction(async (tx) => {
      let recordId: string;
      if (reusedHit) {
        recordId = reusedHit.id;
      } else {
        // Unique slug within (org, type): append -2, -3… on collision.
        const base = slugify(displayName);
        let slug = base;
        for (let n = 2; ; n++) {
          const clash = await tx.record.findUnique({
            where: {
              organizationId_recordTypeKey_slug: {
                organizationId: orgId,
                recordTypeKey: input.recordTypeKey,
                slug,
              },
            },
            select: { id: true },
          });
          if (!clash) break;
          slug = `${base}-${n}`;
        }

        const created = await tx.record.create({
          data: {
            organizationId: orgId,
            recordTypeId: rtDef.id,
            recordTypeKey: input.recordTypeKey,
            displayName,
            slug,
            status:
              typeof input.values?.["status"] === "string"
                ? (input.values["status"] as string)
                : null,
            sensitivity: (rtDef.sensitivity as Sensitivity) ?? "GENERAL",
            values: (input.values ?? {}) as unknown as Prisma.InputJsonValue,
            reviewStatus: "reviewed",
          },
          select: { id: true },
        });
        recordId = created.id;
      }

      const writeEdge = async (
        relationshipTypeKey: string,
        direction: "outgoing" | "incoming",
        otherId: string,
        attribution: string,
      ) => {
        // Ensure pack-defined relationship types exist (e.g. newly added ones).
        let relDef = await tx.relationshipTypeDefinition.findUnique({
          where: {
            organizationId_key: { organizationId: orgId, key: relationshipTypeKey },
          },
          select: { id: true },
        });
        if (!relDef) {
          const packRel = softwarePack.relationshipTypes.find(
            (r) => r.key === relationshipTypeKey,
          );
          if (!packRel) return;
          await tx.relationshipTypeDefinition.create({
            data: {
              organizationId: orgId,
              key: packRel.key,
              sourceTypeKey: packRel.sourceTypeKey,
              targetTypeKey: packRel.targetTypeKey,
              forwardLabel: packRel.forwardLabel,
              reverseLabel: packRel.reverseLabel,
              cardinality: packRel.cardinality ?? "many_to_many",
              required: packRel.required ?? false,
              sensitivity: (packRel.sensitivity as Sensitivity) ?? "GENERAL",
              supportsValidity: packRel.supportsValidity ?? false,
            },
          });
          relDef = { id: "created" };
        }
        const other = await tx.record.findFirst({
          where: { id: otherId, organizationId: orgId },
          select: { id: true },
        });
        if (!other) return;
        const sourceId = direction === "outgoing" ? recordId : other.id;
        const targetId = direction === "outgoing" ? other.id : recordId;
        if (sourceId === targetId) return;
        const exists = await tx.relationship.findFirst({
          where: {
            organizationId: orgId,
            relationshipTypeKey,
            sourceId,
            targetId,
          },
          select: { id: true },
        });
        if (exists) return;
        await tx.relationship.create({
          data: {
            organizationId: orgId,
            relationshipTypeKey,
            sourceId,
            targetId,
            reviewStatus: "reviewed",
            sourceAttribution: attribution,
            createdById: user.id,
          },
        });
      };

      for (const c of input.connections) {
        if (!c.otherId || !c.relationshipTypeKey) continue;
        await writeEdge(
          c.relationshipTypeKey,
          c.direction,
          c.otherId,
          "manual",
        );
      }

      // Brain fan-out: e.g. Vendor→Product also links people on that product.
      for (const c of input.connections) {
        if (!c.otherId || !c.relationshipTypeKey) continue;
        const other = await tx.record.findFirst({
          where: { id: c.otherId, organizationId: orgId },
          select: { id: true, recordTypeKey: true },
        });
        if (!other) continue;

        let peopleOnProduct: string[] = [];
        let productsOfPerson: string[] = [];
        let vendorsOfProduct: string[] = [];
        let productsOfVendor: string[] = [];

        if (other.recordTypeKey === "product") {
          const inv = await tx.relationship.findMany({
            where: {
              organizationId: orgId,
              relationshipTypeKey: "investor_backs_product",
              targetId: other.id,
            },
            select: { sourceId: true },
          });
          const featureLinks = await tx.relationship.findMany({
            where: {
              organizationId: orgId,
              relationshipTypeKey: "feature_belongs_to_product",
              targetId: other.id,
            },
            select: { sourceId: true },
          });
          const featureIds = featureLinks.map((r) => r.sourceId);
          const owners =
            featureIds.length === 0
              ? []
              : await tx.relationship.findMany({
                  where: {
                    organizationId: orgId,
                    relationshipTypeKey: "person_owns_feature",
                    targetId: { in: featureIds },
                  },
                  select: { sourceId: true },
                });
          peopleOnProduct = [
            ...new Set([
              ...inv.map((r) => r.sourceId),
              ...owners.map((r) => r.sourceId),
            ]),
          ];
          const vendorLinks = await tx.relationship.findMany({
            where: {
              organizationId: orgId,
              relationshipTypeKey: "product_uses_vendor",
              sourceId: other.id,
            },
            select: { targetId: true },
          });
          vendorsOfProduct = vendorLinks.map((r) => r.targetId);
        }
        if (other.recordTypeKey === "person") {
          const backed = await tx.relationship.findMany({
            where: {
              organizationId: orgId,
              relationshipTypeKey: "investor_backs_product",
              sourceId: other.id,
            },
            select: { targetId: true },
          });
          productsOfPerson = backed.map((r) => r.targetId);
        }
        if (other.recordTypeKey === "vendor") {
          const productLinks = await tx.relationship.findMany({
            where: {
              organizationId: orgId,
              relationshipTypeKey: "product_uses_vendor",
              targetId: other.id,
            },
            select: { sourceId: true },
          });
          productsOfVendor = productLinks.map((r) => r.sourceId);
        }

        const extras = brainFanOut({
          newRecordTypeKey: input.recordTypeKey,
          primary: {
            relationshipTypeKey: c.relationshipTypeKey,
            direction: c.direction,
            otherId: other.id,
            otherTypeKey: other.recordTypeKey,
          },
          peopleOnProduct,
          productsOfPerson,
          vendorsOfProduct,
          productsOfVendor,
        });
        for (const e of extras) {
          await writeEdge(
            e.relationshipTypeKey,
            e.direction,
            e.otherId,
            "brain",
          );
        }
      }

      return recordId;
    });

    await recordAudit({
      organizationId: orgId,
      actorUserId: user.id,
      action: reusedHit ? "record.reused" : "record.created",
      entityType: "Record",
      entityId: newId,
      summary: reusedHit
        ? `Reused ${rtDef.name}: ${reusedHit.displayName} (matched “${displayName}”)`
        : `Added ${rtDef.name}: ${displayName}`,
      metadata: {
        recordTypeKey: input.recordTypeKey,
        connections: input.connections.length,
        reused: Boolean(reusedHit),
        matchedName: reusedHit?.displayName,
      },
    });

    revalidatePath(`/app/${orgId}/graph`);
    revalidatePath(`/app/${orgId}/workspace`);
    return {
      id: newId,
      reused: Boolean(reusedHit),
      matchedName: reusedHit?.displayName,
    };
  } catch {
    return { error: "Could not create the record. Try again." };
  }
}

// ---------------------------------------------------------------------------
// AI fill: propose a set of records/relationships, then apply the accepted ones.
// ---------------------------------------------------------------------------

async function loadSchema(orgId: string): Promise<GraphSchema> {
  const [types, rels] = await Promise.all([
    prisma.recordTypeDefinition.findMany({
      where: { organizationId: orgId },
      select: { key: true, name: true, fields: true },
    }),
    prisma.relationshipTypeDefinition.findMany({
      where: { organizationId: orgId },
      select: {
        key: true,
        sourceTypeKey: true,
        targetTypeKey: true,
        forwardLabel: true,
        reverseLabel: true,
      },
    }),
  ]);
  return {
    types: types.map((t) => ({
      key: t.key,
      name: t.name,
      fields: fieldsFromJson(t.fields).map((f) => ({
        key: f.key,
        name: f.name,
        type: f.type,
        options: f.options,
      })),
    })),
    relationshipTypes: rels,
  };
}

export type ProposeResult = { proposals?: ProposalSet; error?: string };

export async function proposeGraphFill(
  orgId: string,
  input: { kind: "expand" | "repo"; anchorId: string; repoText?: string },
): Promise<ProposeResult> {
  const { role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to add records." };
  }
  const anchor = await prisma.record.findFirst({
    where: { id: input.anchorId, organizationId: orgId },
    select: { id: true, displayName: true, recordTypeKey: true },
  });
  if (!anchor) return { error: "Pick a node to build from." };

  const schema = await loadSchema(orgId);
  const anchorTypeName =
    schema.types.find((t) => t.key === anchor.recordTypeKey)?.name ??
    anchor.recordTypeKey;

  const records = await prisma.record.findMany({
    where: { organizationId: orgId, archived: false },
    select: { displayName: true, recordTypeKey: true },
  });
  const existingByType: Record<string, string[]> = {};
  for (const r of records) {
    (existingByType[r.recordTypeKey] ??= []).push(r.displayName);
  }

  try {
    const proposals = await generateProposals({
      kind: input.kind,
      anchor: {
        id: anchor.id,
        name: anchor.displayName,
        typeKey: anchor.recordTypeKey,
        typeName: anchorTypeName,
      },
      schema,
      existingByType,
      repoText: input.repoText,
    });
    return { proposals };
  } catch {
    return { error: "Could not generate suggestions. Try again." };
  }
}

export interface AcceptedNode {
  tempId: string;
  recordTypeKey: string;
  displayName: string;
  values?: Record<string, unknown>;
}
export interface AcceptedEdge {
  relationshipTypeKey: string;
  sourceRef: string;
  targetRef: string;
}
export type ApplyResult = {
  created?: number;
  reused?: number;
  edges?: number;
  error?: string;
};

export async function applyProposals(
  orgId: string,
  accepted: { nodes: AcceptedNode[]; edges: AcceptedEdge[] },
): Promise<ApplyResult> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to add records." };
  }
  const nodes = accepted.nodes.filter((n) => n.displayName?.trim());
  if (nodes.length === 0 && accepted.edges.length === 0) {
    return { error: "Nothing selected." };
  }

  // Resolve fuzzy canonical matches before the write txn so we don't nest
  // pg_trgm set_config inside the apply transaction.
  const fuzzyByTemp = new Map<string, string>();
  for (const n of nodes) {
    try {
      const hit = await findCanonicalRecord(
        orgId,
        n.recordTypeKey,
        n.displayName.trim(),
      );
      if (hit) fuzzyByTemp.set(n.tempId, hit.id);
    } catch {
      // Extension may not be ready — exact match below still covers equals.
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const idByTemp = new Map<string, string>();
      let created = 0;
      let reused = 0;

      for (const n of nodes) {
        const name = n.displayName.trim();
        const rtDef = await tx.recordTypeDefinition.findUnique({
          where: { organizationId_key: { organizationId: orgId, key: n.recordTypeKey } },
        });
        if (!rtDef) continue;

        const fuzzyId = fuzzyByTemp.get(n.tempId);
        if (fuzzyId) {
          idByTemp.set(n.tempId, fuzzyId);
          reused++;
          continue;
        }

        // Exact case-insensitive fallback when pg_trgm isn't available.
        const match = await tx.record.findFirst({
          where: {
            organizationId: orgId,
            recordTypeKey: n.recordTypeKey,
            displayName: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (match) {
          idByTemp.set(n.tempId, match.id);
          reused++;
          continue;
        }

        const base = slugify(name);
        let slug = base;
        for (let k = 2; ; k++) {
          const clash = await tx.record.findUnique({
            where: {
              organizationId_recordTypeKey_slug: {
                organizationId: orgId,
                recordTypeKey: n.recordTypeKey,
                slug,
              },
            },
            select: { id: true },
          });
          if (!clash) break;
          slug = `${base}-${k}`;
        }
        const rec = await tx.record.create({
          data: {
            organizationId: orgId,
            recordTypeId: rtDef.id,
            recordTypeKey: n.recordTypeKey,
            displayName: name,
            slug,
            sensitivity: (rtDef.sensitivity as Sensitivity) ?? "GENERAL",
            values: (n.values ?? {}) as unknown as Prisma.InputJsonValue,
            reviewStatus: "unreviewed",
          },
          select: { id: true },
        });
        idByTemp.set(n.tempId, rec.id);
        created++;
      }

      const resolve = async (ref: string): Promise<string | null> => {
        const [kind, val] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
        if (kind === "new") return idByTemp.get(val) ?? null;
        const rec = await tx.record.findFirst({
          where: { id: val, organizationId: orgId },
          select: { id: true },
        });
        return rec?.id ?? null;
      };

      let edges = 0;
      for (const e of accepted.edges) {
        const sourceId = await resolve(e.sourceRef);
        const targetId = await resolve(e.targetRef);
        if (!sourceId || !targetId || sourceId === targetId) continue;
        const relDef = await tx.relationshipTypeDefinition.findUnique({
          where: {
            organizationId_key: { organizationId: orgId, key: e.relationshipTypeKey },
          },
          select: { id: true },
        });
        if (!relDef) continue;
        const dupe = await tx.relationship.findFirst({
          where: {
            organizationId: orgId,
            relationshipTypeKey: e.relationshipTypeKey,
            sourceId,
            targetId,
          },
          select: { id: true },
        });
        if (dupe) continue;
        await tx.relationship.create({
          data: {
            organizationId: orgId,
            relationshipTypeKey: e.relationshipTypeKey,
            sourceId,
            targetId,
            reviewStatus: "unreviewed",
            sourceAttribution: "ai",
            createdById: user.id,
          },
        });
        edges++;
      }

      return { created, reused, edges };
    });

    await recordAudit({
      organizationId: orgId,
      actorUserId: user.id,
      action: "graph.ai_fill_applied",
      entityType: "Organization",
      entityId: orgId,
      summary: `AI fill: ${result.created} new, ${result.reused} reused, ${result.edges} links`,
      metadata: result,
    });
    revalidatePath(`/app/${orgId}/graph`);
    revalidatePath(`/app/${orgId}/workspace`);
    return result;
  } catch {
    return { error: "Could not apply the changes. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Fuzzy search + duplicate merge (Postgres pg_trgm)
// ---------------------------------------------------------------------------

export type FuzzySearchResult = { hits?: FuzzyHit[]; error?: string };

/** Debounced from the graph search box / builder name field. */
export async function fuzzySearchRecords(
  orgId: string,
  query: string,
  recordTypeKey?: string,
): Promise<FuzzySearchResult> {
  await requireOrgAccess(orgId);
  const q = query.trim();
  if (q.length < 1) return { hits: [] };
  try {
    const hits = await fuzzyFindRecords({
      organizationId: orgId,
      query: q,
      recordTypeKey,
      limit: recordTypeKey ? 8 : 24,
      minScore: recordTypeKey ? 0.2 : 0.25,
    });
    return { hits };
  } catch {
    return { error: "Fuzzy search unavailable. Is pg_trgm enabled?" };
  }
}

export type DuplicatesResult = { pairs?: DuplicatePair[]; error?: string };

export async function listNearDuplicates(
  orgId: string,
): Promise<DuplicatesResult> {
  const { role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to merge records." };
  }
  try {
    const pairs = await findNearDuplicates(orgId, 0.55);
    return { pairs };
  } catch {
    return { error: "Could not scan for duplicates. Is pg_trgm enabled?" };
  }
}

export type MergeResult = { edgesMoved?: number; error?: string };

export async function deleteRelationship(
  orgId: string,
  edgeId: string,
): Promise<{ error?: string }> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to remove connections." };
  }
  try {
    await prisma.relationship.deleteMany({
      where: { id: edgeId, organizationId: orgId },
    });
    await recordAudit({
      organizationId: orgId,
      actorUserId: user.id,
      action: "relationship.deleted",
      entityType: "Relationship",
      entityId: edgeId,
      summary: "Removed a connection from the graph",
      metadata: { edgeId },
    });
    revalidatePath(`/app/${orgId}/graph`);
    revalidatePath(`/app/${orgId}/workspace`);
    return {};
  } catch {
    return { error: "Could not remove the connection." };
  }
}

export async function mergeDuplicatePair(
  orgId: string,
  keepId: string,
  dropId: string,
): Promise<MergeResult> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canEditRecords(role)) {
    return { error: "You do not have permission to merge records." };
  }
  try {
    const { edgesMoved } = await mergeRecords(orgId, keepId, dropId);
    await recordAudit({
      organizationId: orgId,
      actorUserId: user.id,
      action: "record.merged",
      entityType: "Record",
      entityId: keepId,
      summary: `Merged duplicate into ${keepId} (dropped ${dropId})`,
      metadata: { keepId, dropId, edgesMoved },
    });
    revalidatePath(`/app/${orgId}/graph`);
    revalidatePath(`/app/${orgId}/workspace`);
    return { edgesMoved };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Merge failed." };
  }
}
