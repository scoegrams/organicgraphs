import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  CornerTicks,
  DimensionRule,
  NodeGraphGlyph,
} from "@/components/construction-marks";
import { cn } from "@/lib/utils";
import { DemoDataButton } from "./demo-button";

export default async function WorkspacePage({
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

  const [
    recordTypes,
    relationshipTypeCount,
    permissionGroups,
    workflows,
    dashboards,
    healthChecks,
    auditEvents,
    recordCount,
    relationshipCount,
    recordsByType,
  ] = await Promise.all([
    prisma.recordTypeDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.relationshipTypeDefinition.count({ where: { organizationId: orgId } }),
    prisma.permissionGroup.findMany({ where: { organizationId: orgId } }),
    prisma.workflowDefinition.findMany({ where: { organizationId: orgId } }),
    prisma.dashboardDefinition.findMany({ where: { organizationId: orgId } }),
    prisma.healthCheckDefinition.findMany({ where: { organizationId: orgId } }),
    prisma.auditEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.record.count({ where: { organizationId: orgId, archived: false } }),
    prisma.relationship.count({ where: { organizationId: orgId } }),
    prisma.record.groupBy({
      by: ["recordTypeKey"],
      where: { organizationId: orgId, archived: false },
      _count: { _all: true },
    }),
  ]);

  const countByTypeKey = new Map(
    recordsByType.map((r) => [r.recordTypeKey, r._count._all]),
  );
  const isSoftware = organization.industryPackKey === "software";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative mt-1 h-12 w-12 shrink-0 border border-border p-2">
            <CornerTicks />
            <NodeGraphGlyph className="text-primary" />
          </div>
          <div>
            <Link
              href="/app"
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              ← Organizations
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {organization.name} workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Schema v{schema.version} is live. This model now backs records,
              relationships, dashboards, and health checks.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="success">Workspace generated</Badge>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isSoftware ? <DemoDataButton orgId={orgId} /> : null}
            <a
              href={`/app/${orgId}/export/brain`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Download AI brain
            </a>
            <a
              href={`/app/${orgId}/export/obsidian`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Export to Obsidian
            </a>
          </div>
        </div>
      </div>

      <DimensionRule />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={recordCount} label="Records" highlight />
        <Stat n={relationshipCount} label="Relationships" highlight />
        <Stat n={recordTypes.length} label="Record types" />
        <Stat n={relationshipTypeCount} label="Relationship types" />
        <Stat n={permissionGroups.length} label="Permission groups" />
        <Stat n={workflows.length} label="Workflows" />
        <Stat n={dashboards.length} label="Dashboards" />
        <Stat n={healthChecks.length} label="Health checks" />
      </div>

      {recordCount === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No records yet.{" "}
            {isSoftware
              ? "Your graph is normally populated automatically from your wizard answers (people, apps, hosts, features). To explore with a fully-worked fictional company instead, click “Load sample company” above."
              : "Record entry is the next milestone."}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record types</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {recordTypes.map((rt) => {
              const n = countByTypeKey.get(rt.key) ?? 0;
              return (
              <span
                key={rt.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm",
                  n > 0 && "border-primary/40",
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: rt.color ?? "#64748b" }}
                />
                {rt.name}
                {n > 0 ? (
                  <span className="font-mono text-xs tabular-nums text-primary">
                    {n}
                  </span>
                ) : null}
              </span>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflows.map((w) => {
              const def = w.definition as { states?: { name: string }[] };
              return (
                <div key={w.id}>
                  <p className="text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(def.states ?? []).map((s) => s.name).join(" → ")}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automated health checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {healthChecks.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{h.name}</span>
                <Badge
                  variant={
                    h.severity === "critical"
                      ? "destructive"
                      : h.severity === "warning"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {h.severity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity (audit)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {auditEvents.map((e) => (
              <div key={e.id} className="flex flex-col">
                <span>{e.summary ?? e.action}</span>
                <span className="text-xs text-muted-foreground">
                  {e.action} · {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">AI brain export</p>
            <p>
              Download an <code>AGENTS.md</code> and{" "}
              <code>.cursor/rules/company-brain.mdc</code> generated from this
              graph. Drop them in your repo so your AI assistant knows your
              people, apps, hosting, vendors, and features while you code.
            </p>
          </div>
          <a
            href={`/app/${orgId}/export/brain`}
            className={cn(
              buttonVariants({ size: "sm" }),
              "shrink-0 self-start sm:self-auto",
            )}
          >
            Download .zip
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">Obsidian export</p>
            <p>
              Download a Markdown vault of this workspace schema (and any
              records) for local testing. Open the unzipped folder as an
              Obsidian vault.
            </p>
          </div>
          <a
            href={`/app/${orgId}/export/obsidian`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "shrink-0 self-start sm:self-auto",
            )}
          >
            Download .zip
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  n,
  label,
  highlight = false,
}: {
  n: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-primary/50")}>
      <CardContent className="py-4">
        <p className="font-mono text-2xl font-semibold tabular-nums text-primary">
          {n}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
