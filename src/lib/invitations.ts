import "server-only";
import crypto from "node:crypto";
import type { SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/accounts";

/**
 * Organization invitations.
 *
 * The raw token only ever exists in the invite link. What is stored is its
 * SHA-256 digest, so reading the database does not grant anyone org access.
 */

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 14;

function digest(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CreatedInvitation {
  id: string;
  /** Shown once, at creation. It cannot be recovered afterwards. */
  token: string;
  email: string;
  role: SystemRole;
  expiresAt: Date;
}

export async function createInvitation(input: {
  organizationId: string;
  email: string;
  role: SystemRole;
  invitedById: string;
  ttlDays?: number;
}): Promise<CreatedInvitation> {
  const email = normalizeEmail(input.email);
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000,
  );

  // Re-inviting the same address supersedes any outstanding invite so an old
  // link cannot be redeemed after the role was reconsidered.
  await prisma.invitation.updateMany({
    where: {
      organizationId: input.organizationId,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const created = await prisma.invitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: digest(token),
      invitedById: input.invitedById,
      expiresAt,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  return { ...created, token };
}

export type InvitationLookup =
  | {
      ok: true;
      invitation: {
        id: string;
        email: string;
        role: SystemRole;
        organizationId: string;
        organizationName: string;
      };
    }
  | { ok: false; reason: "not_found" | "expired" | "already_accepted" | "revoked" };

export async function lookupInvitation(token: string): Promise<InvitationLookup> {
  const found = await prisma.invitation.findUnique({
    where: { tokenHash: digest(token) },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true } },
    },
  });

  if (!found) return { ok: false, reason: "not_found" };
  if (found.revokedAt) return { ok: false, reason: "revoked" };
  if (found.acceptedAt) return { ok: false, reason: "already_accepted" };
  if (found.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    invitation: {
      id: found.id,
      email: found.email,
      role: found.role,
      organizationId: found.organizationId,
      organizationName: found.organization.name,
    },
  };
}

export type AcceptResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

/**
 * Redeems an invitation for a signed-in user.
 *
 * The invited address must match the account redeeming it, otherwise a
 * forwarded link would let anyone in. An existing membership is never
 * downgraded — an owner who re-accepts a contributor invite stays an owner.
 */
export async function acceptInvitation(token: string, user: User): Promise<AcceptResult> {
  const lookup = await lookupInvitation(token);
  if (!lookup.ok) {
    const messages: Record<typeof lookup.reason, string> = {
      not_found: "That invitation link is not valid.",
      expired: "That invitation has expired. Ask for a new one.",
      already_accepted: "That invitation has already been used.",
      revoked: "That invitation was withdrawn.",
    };
    return { ok: false, error: messages[lookup.reason] };
  }

  const { invitation } = lookup;
  if (normalizeEmail(user.email) !== invitation.email) {
    return {
      ok: false,
      error: `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });

  return { ok: true, organizationId: invitation.organizationId };
}

/**
 * Best-effort redemption during sign-in or sign-up. A bad token must not block
 * the login itself; the invite page reports the problem in detail.
 */
export async function acceptInvitationForUser(
  token: FormDataEntryValue | null,
  user: User,
): Promise<void> {
  if (typeof token !== "string" || token.length === 0) return;
  await acceptInvitation(token, user).catch(() => undefined);
}
