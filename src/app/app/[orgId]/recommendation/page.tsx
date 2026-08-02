import { redirect } from "next/navigation";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { WizardAnswersSchema } from "@/lib/wizard";
import { generateRecommendation } from "@/lib/recommender";
import { computeCounts } from "@/lib/meta-model";
import { loadPayload } from "@/lib/recommendation-edit";
import { ReviewClient } from "./review-client";

export default async function RecommendationPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { organization, role } = await requireOrgAccess(orgId);

  // Must have finished the interview and chosen a pack.
  const session = await prisma.wizardSession.findUnique({
    where: { organizationId: orgId },
  });
  if (!organization.industryPackKey) redirect(`/app/${orgId}/industry`);
  if (session?.status !== "completed") redirect(`/app/${orgId}/wizard`);

  // If a workspace was already generated, go there.
  const existingSchema = await prisma.schemaVersion.findFirst({
    where: { organizationId: orgId },
  });
  if (existingSchema) redirect(`/app/${orgId}/workspace`);

  // Load-or-create the draft recommendation.
  let rec = await prisma.recommendation.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) {
    const answers = WizardAnswersSchema.parse(session?.answers ?? {});
    const generated = await generateRecommendation(
      organization.industryPackKey,
      answers,
    );
    rec = await prisma.recommendation.create({
      data: {
        organizationId: orgId,
        payload: generated.payload as never,
        counts: generated.counts as never,
        source: generated.source,
        status: "DRAFT",
      },
    });
  }

  const view = loadPayload(rec.payload);
  const counts = computeCounts(view);

  return (
    <ReviewClient
      orgId={orgId}
      orgName={organization.name}
      recommendation={view}
      counts={counts}
      source={rec.source}
      canApprove={RolePrivileges.canApproveRecommendation(role)}
    />
  );
}
