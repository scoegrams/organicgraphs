"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { z } from "zod";
import { DEFAULT_DESIGN_COLORS } from "@/lib/design-palette";

const DesignPackSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  colorPrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(DEFAULT_DESIGN_COLORS.colorPrimary),
  colorSecondary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(DEFAULT_DESIGN_COLORS.colorSecondary),
  colorAccent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(DEFAULT_DESIGN_COLORS.colorAccent),
  colorNeutral: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(DEFAULT_DESIGN_COLORS.colorNeutral),
  isPublic: z.boolean().default(false),
});

export type DesignPackInput = z.infer<typeof DesignPackSchema>;
export type DesignPackSaveResult = { error?: string };

export async function saveDesignPack(
  orgId: string,
  raw: DesignPackInput,
): Promise<DesignPackSaveResult> {
  const { role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageSchema(role)) {
    return { error: "You need Admin or Owner access to edit the design pack." };
  }

  const parsed = DesignPackSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Invalid design pack data." };
  }

  const data = parsed.data;
  await prisma.orgDesignPack.upsert({
    where: { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, ...data },
  });

  revalidatePath(`/app/${orgId}/design`);
  revalidatePath(`/preview/${orgId}`);
  return {};
}

export async function getDesignPack(orgId: string) {
  return prisma.orgDesignPack.findUnique({ where: { organizationId: orgId } });
}
