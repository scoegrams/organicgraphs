"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/tenant";
import { signOut } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const CreateOrgSchema = z.object({
  name: z.string().trim().min(2, "Give your organization a name.").max(200),
  description: z.string().trim().max(2000).optional(),
});

export type CreateOrgState = { error?: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "org";
  let candidate = root;
  let n = 1;
  // Slugs are globally unique in the schema.
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createOrganization(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const user = await requireUser();
  const parsed = CreateOrgSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const slug = await uniqueSlug(slugify(parsed.data.name));
  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        memberships: { create: { userId: user.id, role: "OWNER" } },
        wizardSession: { create: {} },
      },
    });
    await recordAudit(
      {
        organizationId: created.id,
        actorUserId: user.id,
        action: "org.created",
        entityType: "organization",
        entityId: created.id,
        summary: `Created organization "${created.name}"`,
      },
      tx,
    );
    return created;
  });

  redirect(`/app/${org.id}/industry`);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
