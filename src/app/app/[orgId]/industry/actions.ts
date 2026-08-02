"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgAccess } from "@/lib/tenant";
import { requirePack } from "@/lib/packs";
import { WizardAnswersSchema } from "@/lib/wizard";
import { recordAudit } from "@/lib/audit";

const Schema = z.object({
  orgId: z.string().min(1),
  packKey: z.string().min(1),
});

export async function chooseIndustry(formData: FormData): Promise<void> {
  const parsed = Schema.safeParse({
    orgId: formData.get("orgId"),
    packKey: formData.get("packKey"),
  });
  if (!parsed.success) throw new Error("Invalid industry selection.");

  const { organization, user } = await requireOrgAccess(parsed.data.orgId);
  const pack = requirePack(parsed.data.packKey);

  // Seed the org's industry into the wizard answers so the interview is prefilled.
  const session = await prisma.wizardSession.findUnique({
    where: { organizationId: organization.id },
  });
  const answers = WizardAnswersSchema.parse(session?.answers ?? {});
  answers.organization.industry = pack.name;

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        industryPackKey: pack.key,
        industryPackVersion: pack.version,
      },
    });
    await tx.wizardSession.update({
      where: { organizationId: organization.id },
      data: { answers },
    });
    await recordAudit(
      {
        organizationId: organization.id,
        actorUserId: user.id,
        action: "org.industry_selected",
        entityType: "organization",
        entityId: organization.id,
        summary: `Selected industry pack: ${pack.name} (${pack.version})`,
        metadata: { packKey: pack.key, packVersion: pack.version },
      },
      tx,
    );
  });

  redirect(`/app/${organization.id}/wizard`);
}
