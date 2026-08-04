import { describe, expect, it } from "vitest";
import {
  buildObsidianVaultFiles,
  buildObsidianZip,
  safeFilename,
} from "@/lib/obsidian-export";
import { buildZip } from "@/lib/zip";

const sample = {
  organization: {
    id: "org_1",
    name: "Weston Press",
    slug: "weston-press",
    description: "A small publishing house.",
    industryPackKey: "publishing",
  },
  schemaVersion: 1,
  recordTypes: [
    {
      key: "project",
      name: "Project",
      description: "Primary unit of work",
      sensitivity: "GENERAL",
      fields: [
        { key: "status", name: "Status", type: "status", required: true },
        { key: "due_date", name: "Due date", type: "date" },
      ],
    },
    {
      key: "person",
      name: "Person",
      description: null,
      sensitivity: "INTERNAL",
      fields: [{ key: "email", name: "Email", type: "email" }],
    },
  ],
  relationshipTypes: [
    {
      key: "person_owns_project",
      sourceTypeKey: "person",
      targetTypeKey: "project",
      forwardLabel: "owns",
      reverseLabel: "owned by",
      cardinality: "one_to_many",
    },
  ],
  workflows: [
    {
      key: "editorial",
      name: "Editorial",
      recordTypeKey: "project",
      states: [{ name: "Draft" }, { name: "Review" }, { name: "Published" }],
    },
  ],
  dashboards: [
    {
      key: "ops",
      name: "Ops",
      widgets: [{ kind: "count_by_status", title: "By status" }],
    },
  ],
  healthChecks: [
    {
      key: "unowned",
      name: "Unowned project",
      severity: "warning",
      explanation: "Active project has no owner",
    },
  ],
  permissionGroups: [
    {
      key: "admin",
      name: "Admin",
      description: "Full access",
    },
  ],
  records: [
    {
      id: "rec_maya",
      recordTypeKey: "person",
      displayName: "Maya Chen",
      slug: "maya-chen",
      status: null,
      values: { email: "maya@weston.example" },
      archived: false,
    },
    {
      id: "rec_proj",
      recordTypeKey: "project",
      displayName: "Weston Catalogue",
      slug: "weston-catalogue",
      status: "active",
      values: { status: "active", due_date: "2026-09-12" },
      archived: false,
    },
  ],
  relationships: [
    {
      relationshipTypeKey: "person_owns_project",
      sourceId: "rec_maya",
      targetId: "rec_proj",
      forwardLabel: "owns",
      reverseLabel: "owned by",
    },
  ],
  exportedAt: new Date("2026-08-02T00:00:00.000Z"),
};

describe("obsidian export", () => {
  it("sanitizes filenames against path traversal", () => {
    expect(safeFilename("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFilename("Maya Chen")).toBe("Maya Chen");
    expect(safeFilename("")).toBe("untitled");
  });

  it("builds a readable vault with wiki links and frontmatter", () => {
    const files = buildObsidianVaultFiles(sample);
    expect(files.has("README.md")).toBe(true);
    expect(files.has("Home.md")).toBe(true);
    expect(files.has("_schema/manifest.json")).toBe(true);
    expect(files.has("_Schema.md")).toBe(true);
    expect(files.has("Person/Maya Chen.md")).toBe(true);
    expect(files.has("Project/Weston Catalogue.md")).toBe(true);

    const projectNote = files.get("Project/Weston Catalogue.md")!;
    expect(projectNote).toContain("id: rec_proj");
    expect(projectNote).toContain("type: project");
    expect(projectNote).toContain("[[Maya Chen]]");

    const schemaNote = files.get("_Schema.md")!;
    expect(schemaNote).toContain("owns");

    const manifest = JSON.parse(files.get("_schema/manifest.json")!);
    expect(manifest.format).toBe("orggraph.obsidian-vault.v2");
    expect(manifest.counts.records).toBe(2);
  });

  it("produces a valid zip with PK header", () => {
    const { bytes, filename, fileCount } = buildObsidianZip(sample);
    expect(filename).toBe("weston-press-obsidian-vault.zip");
    expect(fileCount).toBeGreaterThan(5);
    // ZIP local file header magic
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    expect(buildZip([{ path: "a.md", content: "hi" }]).length).toBeGreaterThan(
      30,
    );
  });
});
