import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOrgAccess, RolePrivileges } from "@/lib/tenant";
import { MembersClient } from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { organization, user, role } = await requireOrgAccess(orgId);
  const canManage = RolePrivileges.canManageMembers(role);

  const [memberships, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    canManage
      ? prisma.invitation.findMany({
          where: { organizationId: orgId, acceptedAt: null, revokedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/app/${orgId}/workspace`}
          className="flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:opacity-70"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 11L5 7l4-4" />
          </svg>
          {organization.name}
        </Link>
        <span className="text-border">/</span>
        <h1 className="text-lg font-semibold tracking-tight">People</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          {memberships.length} member{memberships.length === 1 ? "" : "s"}
          {invitations.length > 0 ? ` · ${invitations.length} pending` : ""}
        </p>
      </div>

      <MembersClient
        orgId={orgId}
        canManage={canManage}
        viewerRole={role}
        currentUserId={user.id}
        members={memberships.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          joinedAt: m.createdAt.toISOString(),
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
