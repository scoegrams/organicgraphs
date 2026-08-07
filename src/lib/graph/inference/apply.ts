import type { Prisma, Sensitivity } from "@prisma/client";
import { getPack } from "@/lib/packs";
import { runInference, unsupportedInferredEdges, type GraphEdge, type GraphNode } from "./engine";
import { inferenceRulesForPack, SELF_EDGE_ALLOWED } from "./rules";

type Tx = Prisma.TransactionClient;

const INFERRED_PREFIX = "inferred:";

/** Edges the engine wrote carry their rule key so they can be recomputed later. */
export function inferenceAttribution(ruleKey: string): string {
  return `${INFERRED_PREFIX}${ruleKey}`;
}

export function ruleKeyFromAttribution(attribution: string | null | undefined): string | null {
  if (!attribution?.startsWith(INFERRED_PREFIX)) return null;
  return attribution.slice(INFERRED_PREFIX.length) || null;
}

/**
 * Below this, an inferred edge lands in the review queue instead of being
 * stated outright. Weak rules should surface as suggestions, not facts.
 */
const AUTO_ACCEPT_CONFIDENCE = 0.7;

async function loadGraph(tx: Tx, orgId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [records, relationships] = await Promise.all([
    tx.record.findMany({
      where: { organizationId: orgId },
      select: { id: true, recordTypeKey: true, displayName: true, values: true },
    }),
    tx.relationship.findMany({
      where: { organizationId: orgId },
      select: { relationshipTypeKey: true, sourceId: true, targetId: true },
    }),
  ]);

  return {
    nodes: records.map((r) => ({
      id: r.id,
      typeKey: r.recordTypeKey,
      displayName: r.displayName,
      values: (r.values ?? null) as Record<string, unknown> | null,
    })),
    edges: relationships,
  };
}

/**
 * Creates the relationship type definition on demand from the org's own pack.
 * Returns false when the pack does not define the type, so the caller can skip
 * the edge rather than write something the schema does not describe.
 */
async function ensureRelationshipType(
  tx: Tx,
  orgId: string,
  packKey: string | null,
  relationshipTypeKey: string,
): Promise<boolean> {
  const existing = await tx.relationshipTypeDefinition.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: relationshipTypeKey } },
    select: { id: true },
  });
  if (existing) return true;

  const packRel = packKey
    ? getPack(packKey)?.relationshipTypes.find((r) => r.key === relationshipTypeKey)
    : undefined;
  if (!packRel) return false;

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
  return true;
}

export interface ReconcileResult {
  created: number;
  retracted: number;
}

/**
 * Brings inferred edges in line with the current graph: writes every edge the
 * pack's rules now justify, and removes previously inferred edges whose
 * supporting paths are gone.
 *
 * Idempotent — safe to call after any write. Only edges this engine created are
 * ever deleted; manual and AI-accepted edges are left alone.
 */
export async function reconcileInference(
  tx: Tx,
  orgId: string,
  options: { packKey: string | null; userId?: string | null },
): Promise<ReconcileResult> {
  const rules = inferenceRulesForPack(options.packKey);
  if (rules.length === 0) return { created: 0, retracted: 0 };

  const { nodes, edges } = await loadGraph(tx, orgId);

  const priorInferred = await tx.relationship.findMany({
    where: { organizationId: orgId, sourceAttribution: { startsWith: INFERRED_PREFIX } },
    select: {
      id: true,
      relationshipTypeKey: true,
      sourceId: true,
      targetId: true,
      sourceAttribution: true,
    },
  });

  const stale = unsupportedInferredEdges(
    rules,
    nodes,
    edges,
    priorInferred.map((e) => ({
      relationshipTypeKey: e.relationshipTypeKey,
      sourceId: e.sourceId,
      targetId: e.targetId,
      ruleKey: ruleKeyFromAttribution(e.sourceAttribution),
    })),
  );

  let retracted = 0;
  if (stale.length > 0) {
    const staleKeys = new Set(
      stale.map((e) => `${e.relationshipTypeKey}|${e.sourceId}|${e.targetId}`),
    );
    const ids = priorInferred
      .filter((e) => staleKeys.has(`${e.relationshipTypeKey}|${e.sourceId}|${e.targetId}`))
      .map((e) => e.id);
    if (ids.length > 0) {
      const { count } = await tx.relationship.deleteMany({ where: { id: { in: ids } } });
      retracted = count;
    }
  }

  const retractedKeys = new Set(
    stale.map((e) => `${e.relationshipTypeKey}|${e.sourceId}|${e.targetId}`),
  );
  const surviving = edges.filter(
    (e) => !retractedKeys.has(`${e.relationshipTypeKey}|${e.sourceId}|${e.targetId}`),
  );

  const proposed = runInference(rules, nodes, surviving, { allowSelfEdges: SELF_EDGE_ALLOWED });

  let created = 0;
  const checked = new Map<string, boolean>();
  for (const edge of proposed) {
    let ok = checked.get(edge.relationshipTypeKey);
    if (ok === undefined) {
      ok = await ensureRelationshipType(tx, orgId, options.packKey, edge.relationshipTypeKey);
      checked.set(edge.relationshipTypeKey, ok);
    }
    if (!ok) continue;

    await tx.relationship.create({
      data: {
        organizationId: orgId,
        relationshipTypeKey: edge.relationshipTypeKey,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceAttribution: inferenceAttribution(edge.ruleKey),
        reviewStatus: edge.confidence >= AUTO_ACCEPT_CONFIDENCE ? "reviewed" : "unreviewed",
        createdById: options.userId ?? null,
      },
    });
    created += 1;
  }

  return { created, retracted };
}
