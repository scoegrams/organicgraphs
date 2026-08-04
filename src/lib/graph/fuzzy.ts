import "server-only";
import { prisma } from "@/lib/db";

export interface FuzzyHit {
  id: string;
  displayName: string;
  recordTypeKey: string;
  score: number;
}

export interface FuzzySearchOpts {
  organizationId: string;
  query: string;
  /** Limit to one record type (e.g. "person") for dedupe-on-write. */
  recordTypeKey?: string;
  limit?: number;
  /** Minimum trigram similarity 0–1. Default 0.3 (pg_trgm %). */
  minScore?: number;
}

/**
 * Fuzzy-search records by displayName using Postgres pg_trgm.
 * Combines trigram similarity (`%` / similarity()) with ILIKE substring so
 * short prefixes still work. Returns hits ordered by score desc.
 *
 * Requires the pg_trgm extension + GIN index (see prisma/sql/enable-pg-trgm.sql).
 */
export async function fuzzyFindRecords(
  opts: FuzzySearchOpts,
): Promise<FuzzyHit[]> {
  const q = opts.query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 50);
  const minScore = opts.minScore ?? 0.3;

  const rows = await prisma.$queryRaw<FuzzyHit[]>`
    SELECT
      r.id,
      r."displayName",
      r."recordTypeKey",
      similarity(r."displayName", ${q})::float8 AS score
    FROM "Record" r
    WHERE r."organizationId" = ${opts.organizationId}
      AND r.archived = false
      AND (${opts.recordTypeKey ?? null}::text IS NULL OR r."recordTypeKey" = ${opts.recordTypeKey ?? null})
      AND (
        similarity(r."displayName", ${q}) >= ${minScore}
        OR r."displayName" ILIKE ${"%" + q + "%"}
      )
    ORDER BY score DESC, r."displayName" ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    recordTypeKey: r.recordTypeKey,
    score: Number(r.score),
  }));
}

/**
 * Best existing record of the same type that fuzzy-matches `name`.
 * Used on write paths to reuse a canonical node ("Vance" ≈ "vance ").
 * Returns null when nothing clears the threshold.
 */
export async function findCanonicalRecord(
  organizationId: string,
  recordTypeKey: string,
  name: string,
  minScore = 0.45,
): Promise<FuzzyHit | null> {
  const hits = await fuzzyFindRecords({
    organizationId,
    query: name,
    recordTypeKey,
    limit: 1,
    minScore,
  });
  const top = hits[0];
  if (!top) return null;
  // Exact (case-insensitive) always wins even if score is weirdly low.
  if (top.displayName.trim().toLowerCase() === name.trim().toLowerCase()) {
    return top;
  }
  return top.score >= minScore ? top : null;
}

export interface DuplicatePair {
  keepId: string;
  keepName: string;
  dropId: string;
  dropName: string;
  recordTypeKey: string;
  score: number;
}

/**
 * Find near-duplicate pairs within an org (same type, high name similarity).
 * Used by the "Merge duplicates" cleanup.
 */
export async function findNearDuplicates(
  organizationId: string,
  minScore = 0.55,
): Promise<DuplicatePair[]> {
  const rows = await prisma.$queryRaw<
    {
      keepId: string;
      keepName: string;
      dropId: string;
      dropName: string;
      recordTypeKey: string;
      score: number;
    }[]
  >`
    SELECT
      a.id AS "keepId",
      a."displayName" AS "keepName",
      b.id AS "dropId",
      b."displayName" AS "dropName",
      a."recordTypeKey" AS "recordTypeKey",
      similarity(a."displayName", b."displayName")::float8 AS score
    FROM "Record" a
    JOIN "Record" b
      ON a."organizationId" = b."organizationId"
     AND a."recordTypeKey" = b."recordTypeKey"
     AND a.id < b.id
     AND a.archived = false
     AND b.archived = false
    WHERE a."organizationId" = ${organizationId}
      AND similarity(a."displayName", b."displayName") >= ${minScore}
    ORDER BY score DESC
    LIMIT 50
  `;

  return rows.map((r) => ({
    keepId: r.keepId,
    keepName: r.keepName,
    dropId: r.dropId,
    dropName: r.dropName,
    recordTypeKey: r.recordTypeKey,
    score: Number(r.score),
  }));
}

/**
 * Merge `dropId` into `keepId`: re-point every relationship, then archive/delete
 * the duplicate. Idempotent for already-merged edges.
 */
export async function mergeRecords(
  organizationId: string,
  keepId: string,
  dropId: string,
): Promise<{ edgesMoved: number }> {
  if (keepId === dropId) return { edgesMoved: 0 };

  return prisma.$transaction(async (tx) => {
    const [keep, drop] = await Promise.all([
      tx.record.findFirst({
        where: { id: keepId, organizationId },
        select: { id: true, recordTypeKey: true },
      }),
      tx.record.findFirst({
        where: { id: dropId, organizationId },
        select: { id: true, recordTypeKey: true },
      }),
    ]);
    if (!keep || !drop) throw new Error("Record not found.");
    if (keep.recordTypeKey !== drop.recordTypeKey) {
      throw new Error("Can only merge records of the same type.");
    }

    const edges = await tx.relationship.findMany({
      where: {
        organizationId,
        OR: [{ sourceId: dropId }, { targetId: dropId }],
      },
    });

    let edgesMoved = 0;
    for (const e of edges) {
      const newSource = e.sourceId === dropId ? keepId : e.sourceId;
      const newTarget = e.targetId === dropId ? keepId : e.targetId;
      // Drop self-loops created by the merge.
      if (newSource === newTarget) {
        await tx.relationship.delete({ where: { id: e.id } });
        continue;
      }
      const exists = await tx.relationship.findFirst({
        where: {
          organizationId,
          relationshipTypeKey: e.relationshipTypeKey,
          sourceId: newSource,
          targetId: newTarget,
        },
        select: { id: true },
      });
      if (exists) {
        await tx.relationship.delete({ where: { id: e.id } });
      } else {
        await tx.relationship.update({
          where: { id: e.id },
          data: { sourceId: newSource, targetId: newTarget },
        });
        edgesMoved++;
      }
    }

    await tx.record.delete({ where: { id: dropId } });
    return { edgesMoved };
  });
}

export { normalizeName } from "./names";
