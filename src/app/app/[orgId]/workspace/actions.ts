"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges, assert } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import {
  seedSampleCompany,
  wizardContextFromAnswers,
  emptyWizardContext,
} from "@/lib/demo/seed";
import { WizardAnswersSchema } from "@/lib/wizard";

export type SeedResult = { error?: string; message?: string };

/** Populate the workspace with the fictional "sample company" for exploration. */
export async function loadSampleCompany(orgId: string): Promise<SeedResult> {
  const { user, organization, role } = await requireOrgAccess(orgId);
  assert(
    RolePrivileges.canEditRecords(role),
    "You do not have permission to add records.",
  );

  const schema = await prisma.schemaVersion.findFirst({
    where: { organizationId: orgId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!schema) {
    return { error: "Generate the workspace before loading a sample company." };
  }

  if (organization.industryPackKey !== "software") {
    return {
      error:
        "The sample company is currently only available for the Software pack.",
    };
  }

  // Personalise the sample with any real stack the user entered in the wizard.
  const session = await prisma.wizardSession.findFirst({
    where: { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    select: { answers: true },
  });

  let ctx = emptyWizardContext();
  if (session?.answers) {
    const parsed = WizardAnswersSchema.safeParse(session.answers);
    if (parsed.success) {
      ctx = wizardContextFromAnswers(organization.name, parsed.data);
    }
  }

  const { recordsCreated, relationshipsCreated } = await seedSampleCompany(
    orgId,
    ctx,
  );

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "workspace.sample_seeded",
    entityType: "SchemaVersion",
    entityId: schema.id,
    summary: `Loaded sample company: ${recordsCreated} records, ${relationshipsCreated} relationships`,
    metadata: { recordsCreated, relationshipsCreated },
  });

  revalidatePath(`/app/${orgId}/workspace`);
  return {
    message:
      recordsCreated + relationshipsCreated === 0
        ? "Sample company already loaded — nothing new added."
        : `Added ${recordsCreated} records and ${relationshipsCreated} relationships.`,
  };
}
