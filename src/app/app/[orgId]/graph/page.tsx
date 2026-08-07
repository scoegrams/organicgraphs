import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { fieldsFromJson } from "@/lib/obsidian-export";
import { ruleKeyFromAttribution } from "@/lib/graph/inference/apply";
import { rationaleForRule } from "@/lib/graph/inference/rules";
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
        const ruleKey = ruleKeyFromAttribution(rel.sourceAttribution);
        return {
          id: rel.id,
          source: rel.sourceId,
          target: rel.targetId,
          forwardLabel: t?.forwardLabel ?? rel.relationshipTypeKey,
          reverseLabel: t?.reverseLabel ?? rel.relationshipTypeKey,
          inferredReason: ruleKey ? rationaleForRule(ruleKey) : null,
        };
      }),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Link
          href={`/app/${orgId}/workspace`}
          className="flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:opacity-70"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {organization.name}
        </Link>
        <span className="text-muted-foreground/40 select-none">/</span>
        <h1 className="text-base font-bold tracking-tight">Graph explorer</h1>
        <p className="text-sm text-muted-foreground hidden sm:block">
          Every record and connection, drawn live. Click a node to inspect.
        </p>
      </div>

      <GraphExplorer data={payload} orgId={orgId} />
    </div>
  );
}
