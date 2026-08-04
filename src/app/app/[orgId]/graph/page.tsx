import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { fieldsFromJson } from "@/lib/obsidian-export";
import { GraphExplorer, type GraphPayload } from "./graph-explorer";

export default async function GraphPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { organization } = await requireOrgAccess(orgId);

  const schema = await prisma.schemaVersion.findFirst({
    where: { organizationId: orgId },
    orderBy: { version: "desc" },
  });
  if (!schema) redirect(`/app/${orgId}/recommendation`);

  const [recordTypes, relationshipTypes, records, relationships] =
    await Promise.all([
      prisma.recordTypeDefinition.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
      prisma.relationshipTypeDefinition.findMany({
        where: { organizationId: orgId },
      }),
      prisma.record.findMany({
        where: { organizationId: orgId, archived: false },
        orderBy: { displayName: "asc" },
      }),
      prisma.relationship.findMany({ where: { organizationId: orgId } }),
    ]);

  const relTypeByKey = new Map(relationshipTypes.map((r) => [r.key, r]));
  const typeNameByKey = new Map(recordTypes.map((t) => [t.key, t.name]));

  // Field label maps per record type so the inspector can name raw JSON values.
  const fieldLabelsByType = new Map<string, Record<string, string>>();
  for (const rt of recordTypes) {
    const labels: Record<string, string> = {};
    for (const f of fieldsFromJson(rt.fields)) labels[f.key] = f.name;
    fieldLabelsByType.set(rt.key, labels);
  }

  const recordIds = new Set(records.map((r) => r.id));

  const payload: GraphPayload = {
    orgName: organization.name,
    types: recordTypes.map((rt) => ({
      key: rt.key,
      name: rt.name,
      fields: fieldsFromJson(rt.fields),
    })),
    relationshipTypes: relationshipTypes.map((r) => ({
      key: r.key,
      sourceTypeKey: r.sourceTypeKey,
      targetTypeKey: r.targetTypeKey,
      forwardLabel: r.forwardLabel,
      reverseLabel: r.reverseLabel,
    })),
    nodes: records.map((r) => {
      const values =
        r.values && typeof r.values === "object" && !Array.isArray(r.values)
          ? (r.values as Record<string, unknown>)
          : {};
      const labels = fieldLabelsByType.get(r.recordTypeKey) ?? {};
      const fields = Object.entries(values)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([key, v]) => ({
          label: labels[key] ?? key,
          value: Array.isArray(v)
            ? v.map((x) => String(x)).join(", ")
            : String(v),
        }));
      return {
        id: r.id,
        name: r.displayName,
        typeKey: r.recordTypeKey,
        typeName: typeNameByKey.get(r.recordTypeKey) ?? r.recordTypeKey,
        status: r.status ?? null,
        fields,
      };
    }),
    // Only keep edges whose endpoints are both visible records.
    edges: relationships
      .filter((rel) => recordIds.has(rel.sourceId) && recordIds.has(rel.targetId))
      .map((rel) => {
        const t = relTypeByKey.get(rel.relationshipTypeKey);
        return {
          id: rel.id,
          source: rel.sourceId,
          target: rel.targetId,
          forwardLabel: t?.forwardLabel ?? rel.relationshipTypeKey,
          reverseLabel: t?.reverseLabel ?? rel.relationshipTypeKey,
        };
      }),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/app/${orgId}/workspace`}
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← {organization.name} workspace
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Graph explorer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every record and connection in your organization, drawn live. Click a
            node to inspect it and walk its relationships.
          </p>
        </div>
      </div>

      <GraphExplorer data={payload} orgId={orgId} />
    </div>
  );
}
