"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { computeCounts } from "@/lib/meta-model";
import {
  loadPayload,
  removeItem,
  renameItem,
  EditError,
  type EditableCategory,
} from "@/lib/recommendation-edit";
import { generateRecommendation } from "@/lib/recommender";
import { generateWorkspace } from "@/lib/generate-workspace";
import { recordAudit } from "@/lib/audit";
import { WizardAnswersSchema } from "@/lib/wizard";
import { seedRealFromWizard, wizardContextFromAnswers } from "@/lib/demo/seed";

async function loadLatest(orgId: string) {
  const rec = await prisma.recommendation.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) throw new Error("No recommendation found. Complete the wizard first.");
  return rec;
}

async function persist(orgId: string, recId: string, payload: unknown, status: "EDITED") {
  const parsed = loadPayload(payload);
  await prisma.recommendation.update({
    where: { id: recId },
    data: { payload: parsed as never, counts: computeCounts(parsed) as never, status },
  });
  revalidatePath(`/app/${orgId}/recommendation`);
}

export type EditResult = { error?: string };

export async function removeRecommendationItem(
  orgId: string,
  category: EditableCategory,
  key: string,
): Promise<EditResult> {
  const { role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageSchema(role)) return { error: "You cannot edit the model." };
  const rec = await loadLatest(orgId);
  try {
    const next = removeItem(loadPayload(rec.payload), category, key);
    await persist(orgId, rec.id, next, "EDITED");
    return {};
  } catch (e) {
    if (e instanceof EditError) return { error: e.message };
    throw e;
  }
}

export async function renameRecommendationItem(
  orgId: string,
  category: EditableCategory,
  key: string,
  name: string,
): Promise<EditResult> {
  const { role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageSchema(role)) return { error: "You cannot edit the model." };
  const rec = await loadLatest(orgId);
  try {
    const next = renameItem(loadPayload(rec.payload), category, key, name);
    await persist(orgId, rec.id, next, "EDITED");
    return {};
  } catch (e) {
    if (e instanceof EditError) return { error: e.message };
    throw e;
  }
}

export async function regenerateRecommendation(orgId: string): Promise<EditResult> {
  const { role, organization } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageSchema(role)) return { error: "You cannot regenerate." };
  if (!organization.industryPackKey) return { error: "No industry pack selected." };
  const session = await prisma.wizardSession.findUnique({
    where: { organizationId: orgId },
  });
  const answers = WizardAnswersSchema.parse(session?.answers ?? {});
  const generated = await generateRecommendation(organization.industryPackKey, answers);
  const rec = await loadLatest(orgId);
  await prisma.recommendation.update({
    where: { id: rec.id },
    data: {
      payload: generated.payload as never,
      counts: generated.counts as never,
      source: generated.source,
      status: "DRAFT",
    },
  });
  revalidatePath(`/app/${orgId}/recommendation`);
  return {};
}

export async function approveAndGenerate(orgId: string): Promise<EditResult> {
  const { role, user, organization } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canApproveRecommendation(role)) {
    return { error: "You do not have permission to approve." };
  }
  const rec = await loadLatest(orgId);
  // Revalidate server-side before applying (never trust client state).
  const payload = loadPayload(rec.payload);

  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "APPROVED" },
  });
  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "recommendation.approved",
    entityType: "recommendation",
    entityId: rec.id,
    summary: "Approved the recommended operating model",
  });

  await generateWorkspace({
    organizationId: orgId,
    actorUserId: user.id,
    recommendationId: rec.id,
    payload,
  });

  // Populate the company's real graph from wizard answers (people, apps, hosts,
  // features). Best-effort: a seed hiccup must never block workspace generation.
  if (organization.industryPackKey === "software") {
    try {
      const session = await prisma.wizardSession.findUnique({
        where: { organizationId: orgId },
      });
      const answers = WizardAnswersSchema.parse(session?.answers ?? {});
      const ctx = wizardContextFromAnswers(organization.name, answers);
      const { recordsCreated, relationshipsCreated } =
        await seedRealFromWizard(orgId, ctx);
      if (recordsCreated + relationshipsCreated > 0) {
        await recordAudit({
          organizationId: orgId,
          actorUserId: user.id,
          action: "workspace.seeded_from_wizard",
          entityType: "recommendation",
          entityId: rec.id,
          summary: `Populated real graph from wizard: ${recordsCreated} records, ${relationshipsCreated} relationships`,
          metadata: { recordsCreated, relationshipsCreated },
        });
      }
    } catch {
      // Swallow — the workspace is already generated; the user can still
      // load a sample company or add records manually.
    }
  }

  redirect(`/app/${orgId}/workspace`);
}
