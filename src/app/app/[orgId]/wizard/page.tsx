import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { WizardAnswersSchema, stepIndex } from "@/lib/wizard";
import { WizardClient } from "./wizard-client";
import { RestaurantWizardClient } from "./restaurant-wizard-client";

export default async function WizardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { organization } = await requireOrgAccess(orgId);

  if (!organization.industryPackKey) {
    redirect(`/app/${orgId}/industry`);
  }

  const session = await prisma.wizardSession.findUnique({
    where: { organizationId: orgId },
  });
  const answers = WizardAnswersSchema.parse(session?.answers ?? {});
  // Resume at the saved step, but never on "review" (that's the next screen).
  const savedStep = session?.step ?? "organization";
  const initialIndex = Math.min(stepIndex(savedStep), 4);

  // Route restaurant orgs to the simplified hospitality wizard.
  if (organization.industryPackKey === "restaurant") {
    return (
      <RestaurantWizardClient
        orgId={orgId}
        orgName={organization.name}
        initialAnswers={answers}
        initialStepIndex={initialIndex}
      />
    );
  }

  return (
    <WizardClient
      orgId={orgId}
      orgName={organization.name}
      initialAnswers={answers}
      initialStepIndex={initialIndex}
    />
  );
}
