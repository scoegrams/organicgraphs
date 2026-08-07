import Link from "next/link";
import { requireUser } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CornerTicks } from "@/components/construction-marks";
import { NewOrgForm } from "./new-org-form";

export default async function NewOrganizationPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/app"
          className="text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Back to organizations
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Create an organization
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This becomes an isolated workspace. Next you&apos;ll choose an industry
          pack and complete a short setup interview.
        </p>
      </div>
      <Card className="relative">
        <CornerTicks />
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
        </CardHeader>
        <CardContent>
          <NewOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}
