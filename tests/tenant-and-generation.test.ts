import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { genericPack } from "@/lib/packs/generic";
import { assembleRecommendation } from "@/lib/packs/assemble";
import { computeCounts } from "@/lib/meta-model";
import { emptyAnswers } from "@/lib/wizard";
import { generateWorkspace } from "@/lib/generate-workspace";

// These tests require the local Postgres to be running (npm run db:start).
// They create ephemeral tenants and clean them up afterward.

const RUN_ID = `test_${Date.now()}`;
let userId: string;
let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${RUN_ID}@example.com`, name: "Test User" },
  });
  userId = user.id;

  const orgA = await prisma.organization.create({
    data: {
      name: `A-${RUN_ID}`,
      slug: `a-${RUN_ID}`,
      industryPackKey: "generic",
      industryPackVersion: "1.0.0",
      memberships: { create: { userId, role: "OWNER" } },
      wizardSession: { create: { status: "completed" } },
    },
  });
  orgAId = orgA.id;

  // Org B: the test user is NOT a member.
  const orgB = await prisma.organization.create({
    data: { name: `B-${RUN_ID}`, slug: `b-${RUN_ID}` },
  });
  orgBId = orgB.id;
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("tenant isolation", () => {
  it("a user is not a member of another organization", async () => {
    const membershipToB = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgBId } },
    });
    expect(membershipToB).toBeNull();

    const membershipToA = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgAId } },
    });
    expect(membershipToA).not.toBeNull();
  });

  it("org-scoped queries cannot reach another org's records", async () => {
    // Create a record type + record in org B directly.
    const rtB = await prisma.recordTypeDefinition.create({
      data: { organizationId: orgBId, key: "person", name: "Person" },
    });
    const recordB = await prisma.record.create({
      data: {
        organizationId: orgBId,
        recordTypeId: rtB.id,
        recordTypeKey: "person",
        displayName: "Secret Person",
        slug: "secret-person",
      },
    });

    // The scoping pattern used everywhere: filter by the caller's org id.
    const throughA = await prisma.record.findFirst({
      where: { id: recordB.id, organizationId: orgAId },
    });
    expect(throughA).toBeNull();

    // Sanity: it IS reachable through its own org scope.
    const throughB = await prisma.record.findFirst({
      where: { id: recordB.id, organizationId: orgBId },
    });
    expect(throughB?.id).toBe(recordB.id);
  });
});

describe("workspace generation", () => {
  it("materializes definitions with counts matching the recommendation", async () => {
    const payload = assembleRecommendation(genericPack, emptyAnswers());
    const counts = computeCounts(payload);

    const rec = await prisma.recommendation.create({
      data: {
        organizationId: orgAId,
        payload: payload as never,
        counts: counts as never,
        source: "deterministic",
        status: "APPROVED",
      },
    });

    await generateWorkspace({
      organizationId: orgAId,
      actorUserId: userId,
      recommendationId: rec.id,
      payload,
    });

    const [rt, rel, pg, wf, dash, hc, sv] = await Promise.all([
      prisma.recordTypeDefinition.count({ where: { organizationId: orgAId } }),
      prisma.relationshipTypeDefinition.count({ where: { organizationId: orgAId } }),
      prisma.permissionGroup.count({ where: { organizationId: orgAId } }),
      prisma.workflowDefinition.count({ where: { organizationId: orgAId } }),
      prisma.dashboardDefinition.count({ where: { organizationId: orgAId } }),
      prisma.healthCheckDefinition.count({ where: { organizationId: orgAId } }),
      prisma.schemaVersion.findFirst({ where: { organizationId: orgAId } }),
    ]);

    expect(rt).toBe(counts.recordTypes);
    expect(rel).toBe(counts.relationshipTypes);
    expect(pg).toBe(counts.permissionGroups);
    expect(wf).toBe(counts.workflows);
    expect(dash).toBe(counts.dashboards);
    expect(hc).toBe(counts.healthChecks);
    expect(sv).not.toBeNull();

    // The recommendation is marked GENERATED.
    const after = await prisma.recommendation.findUnique({ where: { id: rec.id } });
    expect(after?.status).toBe("GENERATED");
  });

  it("re-generation is idempotent (upsert, not duplicate)", async () => {
    const payload = assembleRecommendation(genericPack, emptyAnswers());
    const before = await prisma.recordTypeDefinition.count({
      where: { organizationId: orgAId },
    });
    const rec = await prisma.recommendation.create({
      data: {
        organizationId: orgAId,
        payload: payload as never,
        counts: computeCounts(payload) as never,
        source: "deterministic",
        status: "APPROVED",
      },
    });
    await generateWorkspace({
      organizationId: orgAId,
      actorUserId: userId,
      recommendationId: rec.id,
      payload,
    });
    const after = await prisma.recordTypeDefinition.count({
      where: { organizationId: orgAId },
    });
    expect(after).toBe(before);
  });

  it("writes append-only audit events for generation", async () => {
    const events = await prisma.auditEvent.findMany({
      where: { organizationId: orgAId, action: "workspace.generated" },
    });
    expect(events.length).toBeGreaterThan(0);
  });
});
