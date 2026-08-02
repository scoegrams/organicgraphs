"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgAccess } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import {
  WizardAnswersSchema,
  nextStep,
  type WizardAnswers,
  type WizardStepKey,
} from "@/lib/wizard";

/** Persist answers for a step and advance the saved step pointer (for resume). */
export async function saveWizardStep(
  orgId: string,
  step: WizardStepKey,
  answers: WizardAnswers,
): Promise<void> {
  await requireOrgAccess(orgId);
  const parsed = WizardAnswersSchema.parse(answers);
  await prisma.wizardSession.update({
    where: { organizationId: orgId },
    data: { answers: parsed, step: nextStep(step) },
  });
}

/** Finalize the interview and move to recommendation review. */
export async function completeWizard(
  orgId: string,
  answers: WizardAnswers,
): Promise<void> {
  const { user } = await requireOrgAccess(orgId);
  const parsed = WizardAnswersSchema.parse(answers);
  await prisma.$transaction(async (tx) => {
    await tx.wizardSession.update({
      where: { organizationId: orgId },
      data: { answers: parsed, step: "review", status: "completed" },
    });
    await recordAudit(
      {
        organizationId: orgId,
        actorUserId: user.id,
        action: "wizard.completed",
        entityType: "wizard",
        summary: "Completed the setup interview",
      },
      tx,
    );
  });
  redirect(`/app/${orgId}/recommendation`);
}
