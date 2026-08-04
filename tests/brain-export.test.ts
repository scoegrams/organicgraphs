import { describe, expect, it } from "vitest";
import { buildBrainFiles, buildBrainZip, type BrainExportInput } from "@/lib/brain-export";

function input(): BrainExportInput {
  return {
    organization: {
      name: "Acme",
      slug: "acme",
      description: "We build developer tools.",
      industryPackKey: "software",
    },
    recordTypes: [
      { key: "person", name: "Person", description: null, sensitivity: "INTERNAL", fields: [] },
      { key: "service", name: "Service", description: null, sensitivity: "GENERAL", fields: [] },
      { key: "vendor", name: "Provider", description: null, sensitivity: "INTERNAL", fields: [] },
      { key: "feature", name: "Feature", description: null, sensitivity: "GENERAL", fields: [] },
    ],
    relationshipTypes: [
      { key: "service_hosted_on_vendor", sourceTypeKey: "service", targetTypeKey: "vendor", forwardLabel: "is hosted on", reverseLabel: "hosts", cardinality: "many_to_one" },
      { key: "person_owns_feature", sourceTypeKey: "person", targetTypeKey: "feature", forwardLabel: "owns", reverseLabel: "is owned by", cardinality: "one_to_many" },
      { key: "feature_in_service", sourceTypeKey: "feature", targetTypeKey: "service", forwardLabel: "runs in", reverseLabel: "contains", cardinality: "many_to_one" },
    ],
    records: [
      { id: "p1", recordTypeKey: "person", displayName: "Sam", slug: "sam", status: null, values: { role: "Founder" }, archived: false },
      { id: "s1", recordTypeKey: "service", displayName: "API", slug: "api", status: "Healthy", values: { status: "Healthy" }, archived: false },
      { id: "v1", recordTypeKey: "vendor", displayName: "Vercel", slug: "vercel", status: "Active", values: { category: "Hosting", cost: 20, cycle: "Monthly" }, archived: false },
      { id: "f1", recordTypeKey: "feature", displayName: "Checkout", slug: "checkout", status: "Planned", values: { status: "Planned" }, archived: false },
    ],
    relationships: [
      { relationshipTypeKey: "service_hosted_on_vendor", sourceId: "s1", targetId: "v1", forwardLabel: "is hosted on", reverseLabel: "hosts" },
      { relationshipTypeKey: "person_owns_feature", sourceId: "p1", targetId: "f1", forwardLabel: "owns", reverseLabel: "is owned by" },
      { relationshipTypeKey: "feature_in_service", sourceId: "f1", targetId: "s1", forwardLabel: "runs in", reverseLabel: "contains" },
    ],
    exportedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("brain export", () => {
  it("AGENTS.md reflects the real graph", () => {
    const files = buildBrainFiles(input());
    const agents = files.get("AGENTS.md")!;
    expect(agents).toContain("# Acme — company brain");
    expect(agents).toContain("We build developer tools.");
    expect(agents).toContain("Sam");
    expect(agents).toContain("Founder");
    expect(agents).toContain("API");
    expect(agents).toContain("hosted on Vercel");
    expect(agents).toContain("Checkout");
    expect(agents).toContain("owned by Sam");
    expect(agents).toContain("runs in API");
  });

  it("summarizes vendor spend", () => {
    const agents = buildBrainFiles(input()).get("AGENTS.md")!;
    expect(agents).toContain("Vercel");
    expect(agents).toMatch(/\$20/);
    expect(agents).toMatch(/~\$20\/mo/);
  });

  it("emits a valid Cursor rules file with frontmatter", () => {
    const mdc = buildBrainFiles(input()).get(".cursor/rules/company-brain.mdc")!;
    expect(mdc.startsWith("---\n")).toBe(true);
    expect(mdc).toContain("alwaysApply: true");
    expect(mdc).toContain("description: Operating context for Acme");
    expect(mdc).toContain("Acme company brain");
  });

  it("zips both files with a slugged filename", () => {
    const zip = buildBrainZip(input());
    expect(zip.fileCount).toBe(2);
    expect(zip.filename).toBe("acme-ai-brain.zip");
    expect(zip.bytes.length).toBeGreaterThan(0);
  });
});
