import { describe, expect, it } from "vitest";
import { PACKS } from "@/lib/packs";
import { assembleRecommendation } from "@/lib/packs/assemble";
import { computeCounts, summarizeCounts, SchemaRecommendationSchema } from "@/lib/meta-model";
import { emptyAnswers, type WizardAnswers } from "@/lib/wizard";

function baseAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return { ...emptyAnswers(), ...overrides };
}

describe("industry-pack recommendation generation", () => {
  it("every pack assembles into a valid recommendation", () => {
    for (const pack of PACKS) {
      const rec = assembleRecommendation(pack, baseAnswers());
      // Re-validate to be certain the output conforms to the schema.
      expect(SchemaRecommendationSchema.safeParse(rec).success).toBe(true);
      expect(rec.packKey).toBe(pack.key);
      expect(rec.recordTypes.length).toBeGreaterThan(0);
      expect(rec.permissionGroups.some((g) => g.isDefault)).toBe(true);
    }
  });

  it("counts are derived from payload, not hard-coded", () => {
    const pack = PACKS.find((p) => p.key === "generic")!;
    const rec = assembleRecommendation(pack, baseAnswers());
    const counts = computeCounts(rec);
    expect(counts.recordTypes).toBe(rec.recordTypes.length);
    expect(counts.relationshipTypes).toBe(rec.relationshipTypes.length);
    expect(counts.workflows).toBe(rec.workflows.length);
    expect(counts.dashboards).toBe(rec.dashboards.length);
    expect(counts.healthChecks).toBe(rec.healthChecks.length);
  });

  it("answers change the recommendation (dynamic, not static)", () => {
    const pack = PACKS.find((p) => p.key === "generic")!;
    const minimal = assembleRecommendation(pack, baseAnswers());

    const richer = assembleRecommendation(
      pack,
      baseAnswers({
        participants: { groups: ["regulators"], custom: [], people: [] },
        valueAndWork: {
          sells: "consulting",
          primaryUnit: "project",
          stages: ["Intake", "Delivery", "Wrap up"],
          outputs: "reports",
          deadlinesMatter: true,
          blockers: "client delays",
          services: [],
          features: [],
        },
        security: {
          confidentialInfo: "financials",
          regulatedData: true,
          requireAiApproval: true,
          financialRoles: "",
          employeeInfoRoles: "",
        },
      }),
    );

    // Regulator adds a record type + relationship.
    expect(richer.recordTypes.some((rt) => rt.key === "regulator")).toBe(true);
    // Custom workflow built from the user's own stages.
    expect(richer.workflows.some((w) => w.key === "custom_stage_flow")).toBe(true);
    // Deadlines + regulated data add dashboards and checks.
    expect(richer.dashboards.length).toBeGreaterThan(minimal.dashboards.length);
    expect(richer.healthChecks.length).toBeGreaterThan(minimal.healthChecks.length);
    // Every added item still carries an explanation referencing its cause.
    for (const rt of richer.recordTypes) {
      expect(rt.explanation.causedBy.length).toBeGreaterThan(0);
    }
  });

  it("summary sentence reflects real counts", () => {
    const pack = PACKS.find((p) => p.key === "construction")!;
    const rec = assembleRecommendation(pack, baseAnswers());
    const counts = computeCounts(rec);
    const sentence = summarizeCounts(counts);
    expect(sentence).toContain(`${counts.recordTypes} record type`);
    expect(sentence).toContain(`${counts.healthChecks} automated check`);
  });

  it("payments pack never exposes cardholder-data fields", () => {
    const pack = PACKS.find((p) => p.key === "payments")!;
    const rec = assembleRecommendation(pack, baseAnswers());
    expect(pack.warning).toBeTruthy();
    // Inspect actual field keys/names — none may capture cardholder data.
    const fieldTokens = rec.recordTypes.flatMap((rt) =>
      (rt.fields ?? []).flatMap((f) => [f.key.toLowerCase(), f.name.toLowerCase()]),
    );
    const banned = [
      "card_number",
      "cardnumber",
      "card number",
      "cardholder",
      "cvv",
      "cvc",
      "track_data",
      "full_pan",
      "primary account number",
    ];
    for (const token of fieldTokens) {
      for (const b of banned) {
        expect(token.includes(b)).toBe(false);
      }
    }
  });
});
