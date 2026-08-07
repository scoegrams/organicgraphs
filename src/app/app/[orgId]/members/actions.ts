"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SystemRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { createInvitation } from "@/lib/invitations";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "CONTRIBUTOR", "VIEWER"] as const;

const InviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(ROLES),
});

export type InviteState = { error?: string; inviteUrl?: string; email?: string };

/**
 * The link is returned to the inviter rather than emailed. No mail provider is
 * wired up yet, so handing back a copyable URL is the honest interface.
 */
export async function inviteMemberAction(
  orgId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageMembers(role)) {
    return { error: "You do not have permission to invite people." };
  }

  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // Only an owner may mint another owner.
  if (parsed.data.role === "OWNER" && role !== "OWNER") {
    return { error: "Only an owner can invite another owner." };
  }

  const already = await prisma.membership.findFirst({
    where: { organizationId: orgId, user: { email: parsed.data.email } },
    select: { id: true },
  });
  if (already) return { error: "That person is already a member." };

  const invitation = await createInvitation({
    organizationId: orgId,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedById: user.id,
  });

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "member.invited",
    entityType: "Invitation",
    entityId: invitation.id,
    summary: `Invited ${invitation.email} as ${invitation.role}`,
    metadata: { email: invitation.email, role: invitation.role },
  });

  revalidatePath(`/app/${orgId}/members`);
  return {
    inviteUrl: `/invite/${invitation.token}`,
    email: invitation.email,
  };
}

export async function revokeInviteAction(
  orgId: string,
  invitationId: string,
): Promise<{ error?: string }> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageMembers(role)) {
    return { error: "You do not have permission to manage invitations." };
  }

  const { count } = await prisma.invitation.updateMany({
    where: { id: invitationId, organizationId: orgId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { error: "That invitation is no longer pending." };

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "member.invite_revoked",
    entityType: "Invitation",
    entityId: invitationId,
    summary: "Withdrew an invitation",
    metadata: { invitationId },
  });

  revalidatePath(`/app/${orgId}/members`);
  return {};
}

/** Refuses to remove the last owner, which would orphan the organization. */
async function wouldStrandOrg(orgId: string, membershipId: string): Promise<boolean> {
  const owners = await prisma.membership.findMany({
    where: { organizationId: orgId, role: "OWNER" },
    select: { id: true },
  });
  return owners.length <= 1 && owners.some((o) => o.id === membershipId);
}

export async function changeRoleAction(
  orgId: string,
  membershipId: string,
  nextRole: SystemRole,
): Promise<{ error?: string }> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageMembers(role)) {
    return { error: "You do not have permission to change roles." };
  }
  if (nextRole === "OWNER" && role !== "OWNER") {
    return { error: "Only an owner can promote someone to owner." };
  }

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: { id: true, role: true, user: { select: { email: true } } },
  });
  if (!target) return { error: "That member no longer exists." };
  if (target.role === nextRole) return {};

  if (target.role === "OWNER" && (await wouldStrandOrg(orgId, membershipId))) {
    return { error: "Promote another owner before changing this one." };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { role: nextRole },
  });

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "member.role_changed",
    entityType: "Membership",
    entityId: membershipId,
    summary: `Changed ${target.user.email} from ${target.role} to ${nextRole}`,
    metadata: { from: target.role, to: nextRole },
  });

  revalidatePath(`/app/${orgId}/members`);
  return {};
}

export async function removeMemberAction(
  orgId: string,
  membershipId: string,
): Promise<{ error?: string }> {
  const { user, role } = await requireOrgAccess(orgId);
  if (!RolePrivileges.canManageMembers(role)) {
    return { error: "You do not have permission to remove people." };
  }

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: { id: true, role: true, userId: true, user: { select: { email: true } } },
  });
  if (!target) return { error: "That member no longer exists." };

  if (await wouldStrandOrg(orgId, membershipId)) {
    return { error: "This is the only owner. Promote someone else first." };
  }

  await prisma.membership.delete({ where: { id: membershipId } });

  await recordAudit({
    organizationId: orgId,
    actorUserId: user.id,
    action: "member.removed",
    entityType: "Membership",
    entityId: membershipId,
    summary: `Removed ${target.user.email}`,
    metadata: { email: target.user.email, role: target.role },
  });

  revalidatePath(`/app/${orgId}/members`);
  // Removing yourself means losing access to this workspace.
  return target.userId === user.id ? { error: "__left__" } : {};
}
