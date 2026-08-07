/**
 * Show what the inference rules conclude for every organization.
 *
 *   npx tsx scripts/inference-report.ts           # read-only preview
 *   npx tsx scripts/inference-report.ts --apply   # write the conclusions
 *
 * Existing orgs were seeded before the rule engine existed, so `--apply`
 * backfills them. New writes reconcile on their own.
 */
import { PrismaClient } from "@prisma/client";
import { runInference } from "../src/lib/graph/inference/engine";
import { inferenceRulesForPack } from "../src/lib/graph/inference/rules";
import { reconcileInference } from "../src/lib/graph/inference/apply";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, industryPackKey: true },
  });

  for (const org of orgs) {
    const rules = inferenceRulesForPack(org.industryPackKey);
    const [records, relationships] = await Promise.all([
      prisma.record.findMany({
        where: { organizationId: org.id },
        select: { id: true, recordTypeKey: true, displayName: true, values: true },
      }),
      prisma.relationship.findMany({
        where: { organizationId: org.id },
        select: { relationshipTypeKey: true, sourceId: true, targetId: true },
      }),
    ]);

    console.log(
      `\n${org.name} [${org.industryPackKey ?? "no pack"}] — ` +
        `${records.length} records, ${relationships.length} edges, ${rules.length} rules`,
    );
    if (rules.length === 0) continue;

    const nameOf = new Map(records.map((r) => [r.id, r.displayName]));
    const inferred = runInference(
      rules,
      records.map((r) => ({
        id: r.id,
        typeKey: r.recordTypeKey,
        displayName: r.displayName,
        values: (r.values ?? null) as Record<string, unknown> | null,
      })),
      relationships,
    );

    if (inferred.length === 0) {
      console.log("  nothing new to conclude");
      continue;
    }

    for (const e of inferred.sort((a, b) => b.confidence - a.confidence)) {
      console.log(
        `  ${(e.confidence * 100).toFixed(0)}%  ${nameOf.get(e.sourceId)} ` +
          `--[${e.relationshipTypeKey}]-> ${nameOf.get(e.targetId)}` +
          `   (${e.rationale}, support ${e.support})`,
      );
    }

    if (APPLY) {
      const result = await prisma.$transaction((tx) =>
        reconcileInference(tx, org.id, { packKey: org.industryPackKey }),
      );
      console.log(`  → wrote ${result.created}, retracted ${result.retracted}`);
    }
  }

  if (!APPLY) console.log("\nPreview only. Re-run with --apply to write these.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
