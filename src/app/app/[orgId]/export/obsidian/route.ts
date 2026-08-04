import { NextResponse } from "next/server";
import { AccessError, requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  buildObsidianZip,
  fieldsFromJson,
  statesFromWorkflowJson,
  widgetsFromJson,
} from "@/lib/obsidian-export";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  let user: Awaited<ReturnType<typeof requireOrgAccess>>["user"];
  let organization: Awaited<ReturnType<typeof requireOrgAccess>>["organization"];
  try {
    ({ user, organization } = await requireOrgAccess(orgId));
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const schema = await prisma.schemaVersion.findFirst({
    where: { organizationId: orgId },
    orderBy: { version: "desc" },
  });
  if (!schema) {
    return NextResponse.json(
      { error: "Workspace not generated yet." },
      { status: 404 },
    );
  }

  const [
    recordTypes,
    relationshipTypes,
    workflows,
    dashboards,
    healthChecks,
    permissionGroups,
    records,
    relationships,
  ] = await Promise.all([
    prisma.recordTypeDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.relationshipTypeDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { key: "asc" },
    }),
    prisma.workflowDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.dashboardDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.healthCheckDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.permissionGroup.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.record.findMany({
      where: { organizationId: orgId, archived: false },
      orderBy: { displayName: "asc" },
    }),
    prisma.relationship.findMany({
      where: { organizationId: orgId },
    }),
  ]);

  const relTypeByKey = new Map(
    relationshipTypes.map((r) => [r.key, r] as const),
  );

  const zip = buildObsidianZip({
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      industryPackKey: organization.industryPackKey,
    },
    schemaVersion: schema.version,
    recordTypes: recordTypes.map((rt) => ({
      key: rt.key,
      name: rt.name,
      description: rt.description,
      sensitivity: rt.sensitivity,
      fields: fieldsFromJson(rt.fields),
    })),
    relationshipTypes: relationshipTypes.map((rel) => ({
      key: rel.key,
      sourceTypeKey: rel.sourceTypeKey,
      targetTypeKey: rel.targetTypeKey,
      forwardLabel: rel.forwardLabel,
      reverseLabel: rel.reverseLabel,
      cardinality: rel.cardinality,
    })),
    workflows: workflows.map((w) => ({
      key: w.key,
      name: w.name,
      recordTypeKey: w.recordTypeKey,
      states: statesFromWorkflowJson(w.definition),
    })),
    dashboards: dashboards.map((d) => ({
      key: d.key,
      name: d.name,
      widgets: widgetsFromJson(d.widgets),
    })),
    healthChecks: healthChecks.map((h) => ({
      key: h.key,
      name: h.name,
      severity: h.severity,
      explanation: h.explanation,
    })),
    permissionGroups: permissionGroups.map((g) => ({
      key: g.key,
      name: g.name,
      description: g.description,
    })),
    records: records.map((r) => ({
      id: r.id,
      recordTypeKey: r.recordTypeKey,
      displayName: r.displayName,
      slug: r.slug,
      status: r.status,
      values:
        r.values && typeof r.values === "object" && !Array.isArray(r.values)
          ? (r.values as Record<string, unknown>)
          : {},
      archived: r.archived,
    })),
    relationships: relationships.map((rel) => ({
      relationshipTypeKey: rel.relationshipTypeKey,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      forwardLabel:
        relTypeByKey.get(rel.relationshipTypeKey)?.forwardLabel ??
        rel.relationshipTypeKey,
      reverseLabel:
        relTypeByKey.get(rel.relationshipTypeKey)?.reverseLabel ??
        rel.relationshipTypeKey,
    })),
  });

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "workspace.exported.obsidian",
    entityType: "SchemaVersion",
    entityId: schema.id,
    summary: `Exported Obsidian vault (${zip.fileCount} files)`,
    metadata: {
      filename: zip.filename,
      fileCount: zip.fileCount,
      schemaVersion: schema.version,
      recordCount: records.length,
    },
  });

  return new NextResponse(Buffer.from(zip.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
