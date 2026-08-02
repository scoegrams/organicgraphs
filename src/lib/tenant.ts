import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Membership, Organization, SystemRole, User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tenant access control.
//
// Every server entry point that touches org data must go through these helpers.
// They (a) require an authenticated user and (b) verify the user is a member of
// the specific organization before any query runs — so a browser-supplied
// organizationId can never reach another tenant's data.
// ---------------------------------------------------------------------------

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly status: number = 403,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/** Require a signed-in user; redirect to sign-in otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export interface OrgContext {
  user: User;
  organization: Organization;
  membership: Membership;
  role: SystemRole;
}

/**
 * Require that the current user is a member of `organizationId`.
 * Returns the full org context or redirects/throws. Use in server actions and
 * route handlers before any tenant query. Never trusts the id blindly.
 */
export async function requireOrgAccess(
  organizationId: string,
): Promise<OrgContext> {
  const user = await requireUser();
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
    include: { organization: true },
  });
  if (!membership) {
    // Do not reveal whether the org exists — treat as not found for this user.
    throw new AccessError("You do not have access to this organization.", 404);
  }
  return {
    user,
    organization: membership.organization,
    membership,
    role: membership.role,
  };
}

/** Role capability helpers (server-side authorization). */
export const RolePrivileges = {
  canManageSchema: (role: SystemRole) => role === "OWNER" || role === "ADMIN",
  canApproveRecommendation: (role: SystemRole) =>
    role === "OWNER" || role === "ADMIN",
  canEditRecords: (role: SystemRole) =>
    role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "CONTRIBUTOR",
  canManageMembers: (role: SystemRole) => role === "OWNER" || role === "ADMIN",
} as const;

export function assert(condition: unknown, message: string, status = 403): asserts condition {
  if (!condition) throw new AccessError(message, status);
}

/** List organizations the user belongs to (for the org switcher / home). */
export async function listUserOrganizations(userId: string) {
  return prisma.organization.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
  });
}
