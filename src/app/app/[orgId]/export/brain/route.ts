import { NextResponse } from "next/server";
import { AccessError, requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { buildBrainZip } from "@/lib/brain-export";

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

  const [recordTypes, relationshipTypes, records, relationships] =
    await Promise.all([
      prisma.recordTypeDefinition.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
      prisma.relationshipTypeDefinition.findMany({
        where: { organizationId: orgId },
        orderBy: { key: "asc" },
      }),
      prisma.record.findMany({
        where: { organizationId: orgId, archived: false },
        orderBy: { displayName: "asc" },
      }),
      prisma.relationship.findMany({ where: { organizationId: orgId } }),
    ]);

  const relTypeByKey = new Map(relationshipTypes.map((r) => [r.key, r] as const));

  const zip = buildBrainZip({
    organization: {
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      industryPackKey: organization.industryPackKey,
    },
    recordTypes: recordTypes.map((rt) => ({
      key: rt.key,
      name: rt.name,
      description: rt.description,
      sensitivity: rt.sensitivity,
      fields: [],
    })),
    relationshipTypes: relationshipTypes.map((rel) => ({
      key: rel.key,
      sourceTypeKey: rel.sourceTypeKey,
      targetTypeKey: rel.targetTypeKey,
      forwardLabel: rel.forwardLabel,
      reverseLabel: rel.reverseLabel,
      cardinality: rel.cardinality,
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
    })),
  });

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "workspace.exported.brain",
    entityType: "SchemaVersion",
    entityId: schema.id,
    summary: `Exported AI brain (${zip.fileCount} files)`,
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
