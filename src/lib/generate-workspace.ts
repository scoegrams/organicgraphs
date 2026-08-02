import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { loadPayload } from "@/lib/recommendation-edit";
import type { Sensitivity } from "@/lib/meta-model";

function sens(s: string): Sensitivity {
  return (s as Sensitivity) ?? "GENERAL";
}

/**
 * Transactionally materialize an approved recommendation into concrete schema
 * definitions for the tenant. Idempotent per key via upsert, so re-generation
 * updates rather than duplicates. Returns the new SchemaVersion.
 */
export async function generateWorkspace(args: {
  organizationId: string;
  actorUserId: string;
  recommendationId: string;
  payload: unknown;
}) {
  const rec = loadPayload(args.payload);
  const { organizationId } = args;

  return prisma.$transaction(async (tx) => {
    const last = await tx.schemaVersion.findFirst({
      where: { organizationId },
      orderBy: { version: "desc" },
    });
    const version = (last?.version ?? 0) + 1;

    const schemaVersion = await tx.schemaVersion.create({
      data: {
        organizationId,
        version,
        label: `Generated from recommendation`,
        generatedFrom: args.recommendationId,
      },
    });

    for (const rt of rec.recordTypes) {
      await tx.recordTypeDefinition.upsert({
        where: { organizationId_key: { organizationId, key: rt.key } },
        create: {
          organizationId,
          key: rt.key,
          name: rt.name,
          description: rt.description,
          icon: rt.icon,
          color: rt.color,
          sensitivity: sens(rt.sensitivity),
          archivable: rt.archivable,
          markdownTemplate: rt.markdownTemplate,
          fields: rt.fields as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: rt.name,
          description: rt.description,
          icon: rt.icon,
          color: rt.color,
          sensitivity: sens(rt.sensitivity),
          archivable: rt.archivable,
          fields: rt.fields as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const rel of rec.relationshipTypes) {
      await tx.relationshipTypeDefinition.upsert({
        where: { organizationId_key: { organizationId, key: rel.key } },
        create: {
          organizationId,
          key: rel.key,
          sourceTypeKey: rel.sourceTypeKey,
          targetTypeKey: rel.targetTypeKey,
          forwardLabel: rel.forwardLabel,
          reverseLabel: rel.reverseLabel,
          cardinality: rel.cardinality,
          required: rel.required,
          sensitivity: sens(rel.sensitivity),
          supportsValidity: rel.supportsValidity,
        },
        update: {
          forwardLabel: rel.forwardLabel,
          reverseLabel: rel.reverseLabel,
          cardinality: rel.cardinality,
          required: rel.required,
          sensitivity: sens(rel.sensitivity),
          supportsValidity: rel.supportsValidity,
        },
      });
    }

    for (const g of rec.permissionGroups) {
      await tx.permissionGroup.upsert({
        where: { organizationId_key: { organizationId, key: g.key } },
        create: {
          organizationId,
          key: g.key,
          name: g.name,
          description: g.description,
          capabilities: g.capabilities as unknown as Prisma.InputJsonValue,
          isDefault: g.isDefault,
        },
        update: {
          name: g.name,
          description: g.description,
          capabilities: g.capabilities as unknown as Prisma.InputJsonValue,
          isDefault: g.isDefault,
        },
      });
    }

    for (const wf of rec.workflows) {
      await tx.workflowDefinition.upsert({
        where: { organizationId_key: { organizationId, key: wf.key } },
        create: {
          organizationId,
          key: wf.key,
          name: wf.name,
          recordTypeKey: wf.recordTypeKey,
          definition: {
            states: wf.states,
            transitions: wf.transitions,
          } as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: wf.name,
          recordTypeKey: wf.recordTypeKey,
          definition: {
            states: wf.states,
            transitions: wf.transitions,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const d of rec.dashboards) {
      await tx.dashboardDefinition.upsert({
        where: { organizationId_key: { organizationId, key: d.key } },
        create: {
          organizationId,
          key: d.key,
          name: d.name,
          widgets: d.widgets as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: d.name,
          widgets: d.widgets as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const h of rec.healthChecks) {
      await tx.healthCheckDefinition.upsert({
        where: { organizationId_key: { organizationId, key: h.key } },
        create: {
          organizationId,
          key: h.key,
          name: h.name,
          severity: h.severity,
          rule: h.rule as unknown as Prisma.InputJsonValue,
          explanation: h.explanation.why,
        },
        update: {
          name: h.name,
          severity: h.severity,
          rule: h.rule as unknown as Prisma.InputJsonValue,
          explanation: h.explanation.why,
        },
      });
    }

    await tx.recommendation.update({
      where: { id: args.recommendationId },
      data: { status: "GENERATED" },
    });

    await recordAudit(
      {
        organizationId,
        actorUserId: args.actorUserId,
        action: "workspace.generated",
        entityType: "schemaVersion",
        entityId: schemaVersion.id,
        summary: `Generated workspace schema v${version}: ${rec.recordTypes.length} record types, ${rec.relationshipTypes.length} relationships, ${rec.workflows.length} workflows, ${rec.dashboards.length} dashboards, ${rec.healthChecks.length} checks`,
        metadata: {
          recordTypes: rec.recordTypes.length,
          relationshipTypes: rec.relationshipTypes.length,
          permissionGroups: rec.permissionGroups.length,
          workflows: rec.workflows.length,
          dashboards: rec.dashboards.length,
          healthChecks: rec.healthChecks.length,
        },
      },
      tx,
    );

    return schemaVersion;
  });
}
