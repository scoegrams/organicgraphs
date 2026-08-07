import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acceptInvitation, createInvitation, lookupInvitation } from "@/lib/invitations";

// Requires the local Postgres (npm run db:start).

const RUN_ID = `invite_${Date.now()}`;
const INVITER_EMAIL = `${RUN_ID}-owner@example.com`;
const INVITEE_EMAIL = `${RUN_ID}-guest@example.com`;

let orgId: string;
let inviter: User;
let invitee: User;

async function cleanup() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: RUN_ID } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: RUN_ID } } });
}

beforeEach(async () => {
  await cleanup();
  inviter = await prisma.user.create({ data: { email: INVITER_EMAIL, name: "Owner" } });
  invitee = await prisma.user.create({ data: { email: INVITEE_EMAIL, name: "Guest" } });
  const org = await prisma.organization.create({
    data: {
      name: `Invite Co ${RUN_ID}`,
      slug: RUN_ID,
      memberships: { create: { userId: inviter.id, role: "OWNER" } },
    },
  });
  orgId = org.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function invite(overrides: Partial<Parameters<typeof createInvitation>[0]> = {}) {
  return createInvitation({
    organizationId: orgId,
    email: INVITEE_EMAIL,
    role: "CONTRIBUTOR",
    invitedById: inviter.id,
    ...overrides,
  });
}

describe("invitation tokens", () => {
  it("never stores the raw token", async () => {
    const created = await invite();
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tokenHash).not.toBe(created.token);
    expect(row.tokenHash).not.toContain(created.token);
  });

  it("issues a different token every time", async () => {
    const a = await invite();
    const b = await invite({ email: `${RUN_ID}-other@example.com` });
    expect(a.token).not.toBe(b.token);
  });

  it("resolves a valid token to its organization", async () => {
    const created = await invite();
    const lookup = await lookupInvitation(created.token);
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.invitation.organizationId).toBe(orgId);
    expect(lookup.invitation.email).toBe(INVITEE_EMAIL);
  });

  it("rejects a token that was never issued", async () => {
    expect(await lookupInvitation("made-up-token")).toEqual({ ok: false, reason: "not_found" });
  });

  it("supersedes an earlier invite to the same address", async () => {
    const first = await invite();
    await invite({ role: "VIEWER" });
    expect(await lookupInvitation(first.token)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("accepting an invitation", () => {
  it("adds the invitee with the invited role", async () => {
    const created = await invite({ role: "MANAGER" });
    const result = await acceptInvitation(created.token, invitee);
    expect(result).toEqual({ ok: true, organizationId: orgId });

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: invitee.id, organizationId: orgId } },
    });
    expect(membership.role).toBe("MANAGER");
  });

  it("refuses a link forwarded to a different account", async () => {
    const created = await invite();
    const outsider = await prisma.user.create({
      data: { email: `${RUN_ID}-outsider@example.com` },
    });
    const result = await acceptInvitation(created.token, outsider);
    expect(result.ok).toBe(false);

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: outsider.id, organizationId: orgId } },
    });
    expect(membership).toBeNull();
  });

  it("cannot be redeemed twice", async () => {
    const created = await invite();
    expect((await acceptInvitation(created.token, invitee)).ok).toBe(true);
    const second = await acceptInvitation(created.token, invitee);
    expect(second).toEqual({ ok: false, error: expect.stringMatching(/already been used/) });
  });

  it("rejects an expired invitation", async () => {
    const created = await invite();
    await prisma.invitation.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await acceptInvitation(created.token, invitee);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/expired/) });
  });

  it("rejects a withdrawn invitation", async () => {
    const created = await invite();
    await prisma.invitation.update({
      where: { id: created.id },
      data: { revokedAt: new Date() },
    });
    expect((await acceptInvitation(created.token, invitee)).ok).toBe(false);
  });

  it("never demotes someone who already belongs to the org", async () => {
    const created = await invite({ email: INVITER_EMAIL, role: "VIEWER" });
    expect((await acceptInvitation(created.token, inviter)).ok).toBe(true);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: inviter.id, organizationId: orgId } },
    });
    expect(membership.role).toBe("OWNER");
  });

  it("matches the invited address case-insensitively", async () => {
    const created = await invite({ email: INVITEE_EMAIL.toUpperCase() });
    expect((await acceptInvitation(created.token, invitee)).ok).toBe(true);
  });
});
