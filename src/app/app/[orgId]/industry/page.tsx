import Link from "next/link";
import { requireOrgAccess } from "@/lib/tenant";
import { listPackMeta } from "@/lib/packs";
import { chooseIndustry } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DimensionRule } from "@/components/construction-marks";

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { organization } = await requireOrgAccess(orgId);
  const packs = listPackMeta();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app"
          className="text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Organizations
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Choose an industry pack for {organization.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A pack gives you a proven starting model. The setup wizard then tailors
          it to how your organization actually works. You can edit everything
          before anything is created.
        </p>
      </div>

      <DimensionRule />

      <div className="grid gap-4 md:grid-cols-2">
        {packs.map((pack) => (
          <Card
            key={pack.key}
            className="flex flex-col transition-colors hover:border-primary"
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{pack.name}</CardTitle>
                {pack.warning ? (
                  <Badge variant="warning">Safety notes</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-muted-foreground">{pack.description}</p>
              {pack.warning ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {pack.warning}
                </p>
              ) : null}
              <form action={chooseIndustry}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="packKey" value={pack.key} />
                <Button type="submit" variant="outline" className="w-full">
                  Use {pack.name}
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
