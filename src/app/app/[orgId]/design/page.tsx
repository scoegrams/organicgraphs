import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { CornerTicks } from "@/components/construction-marks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignPackEditor } from "./design-editor";
import { DEFAULT_DESIGN_COLORS } from "@/lib/design-palette";

export default async function DesignPage({
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

  const existing = await prisma.orgDesignPack.findUnique({
    where: { organizationId: orgId },
  });

  const initial = {
    tagline: existing?.tagline ?? undefined,
    colorPrimary: existing?.colorPrimary ?? DEFAULT_DESIGN_COLORS.colorPrimary,
    colorSecondary: existing?.colorSecondary ?? DEFAULT_DESIGN_COLORS.colorSecondary,
    colorAccent: existing?.colorAccent ?? DEFAULT_DESIGN_COLORS.colorAccent,
    colorNeutral: existing?.colorNeutral ?? DEFAULT_DESIGN_COLORS.colorNeutral,
    isPublic: existing?.isPublic ?? false,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/app/${orgId}/workspace`}
          className="flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:opacity-70"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {organization.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Design pack</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose colors and a tagline for {organization.name}&apos;s public preview page.
        </p>
      </div>

      <Card className="relative">
        <CornerTicks />
        <CardHeader>
          <CardTitle>Brand identity</CardTitle>
        </CardHeader>
        <CardContent>
          <DesignPackEditor
            orgId={orgId}
            orgName={organization.name}
            initial={initial}
          />
        </CardContent>
      </Card>
    </div>
  );
}
