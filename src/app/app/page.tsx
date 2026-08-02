import Link from "next/link";
import { requireUser, listUserOrganizations } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DimensionRule } from "@/components/construction-marks";
import { PandaMark } from "@/components/panda-mark";

export default async function AppHome() {
  const user = await requireUser();
  const orgs = await listUserOrganizations(user.id);

  // Determine each org's stage so the CTA points to the right next step.
  const withState = await Promise.all(
    orgs.map(async (org) => {
      const [session, latestSchema] = await Promise.all([
        prisma.wizardSession.findUnique({ where: { organizationId: org.id } }),
        prisma.schemaVersion.findFirst({
          where: { organizationId: org.id },
          orderBy: { version: "desc" },
        }),
      ]);
      return { org, session, generated: Boolean(latestSchema) };
    }),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your organizations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each organization is an isolated workspace with its own operating
            model, members, and data.
          </p>
        </div>
        <Link href="/app/new" className={buttonVariants()}>
          New organization
        </Link>
      </div>

      <DimensionRule />

      {withState.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <PandaMark size={80} />
            <div>
              <p className="text-lg font-medium">No organizations yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create your first organization and the panda will start
                stitching its nodes together.
              </p>
            </div>
            <Link href="/app/new" className={buttonVariants({ className: "mt-1" })}>
              Create organization
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withState.map(({ org, session, generated }) => {
            const href = generated
              ? `/app/${org.id}/workspace`
              : session?.status === "completed"
                ? `/app/${org.id}/recommendation`
                : org.industryPackKey
                  ? `/app/${org.id}/wizard`
                  : `/app/${org.id}/industry`;
            const stage = generated
              ? "Workspace ready"
              : session?.status === "completed"
                ? "Review recommendation"
                : org.industryPackKey
                  ? "Continue setup"
                  : "Choose industry";
            return (
              <Link key={org.id} href={href}>
                <Card className="h-full transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{org.name}</CardTitle>
                      <Badge variant={generated ? "success" : "secondary"}>
                        {stage}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {org.description || "No description yet."}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
