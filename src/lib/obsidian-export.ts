/**
 * Build an Obsidian-compatible Markdown vault from a generated workspace.
 * Exports schema definitions always; includes record notes when records exist.
 */

import type { ZipEntry } from "@/lib/zip";
import { buildZip } from "@/lib/zip";

export interface ExportField {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface ExportRecordType {
  key: string;
  name: string;
  description: string | null;
  sensitivity: string;
  fields: ExportField[];
}

export interface ExportRelationshipType {
  key: string;
  sourceTypeKey: string;
  targetTypeKey: string;
  forwardLabel: string;
  reverseLabel: string;
  cardinality: string;
}

export interface ExportWorkflow {
  key: string;
  name: string;
  recordTypeKey: string;
  states: { key?: string; name: string }[];
}

export interface ExportDashboard {
  key: string;
  name: string;
  widgets: { kind?: string; title?: string; label?: string }[];
}

export interface ExportHealthCheck {
  key: string;
  name: string;
  severity: string;
  explanation: string | null;
}

export interface ExportPermissionGroup {
  key: string;
  name: string;
  description: string | null;
}

export interface ExportRecord {
  id: string;
  recordTypeKey: string;
  displayName: string;
  slug: string;
  status: string | null;
  values: Record<string, unknown>;
  archived: boolean;
}

export interface ExportRelationship {
  relationshipTypeKey: string;
  sourceId: string;
  targetId: string;
  forwardLabel: string;
  reverseLabel: string;
}

export interface ObsidianExportInput {
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    industryPackKey: string | null;
  };
  schemaVersion: number;
  recordTypes: ExportRecordType[];
  relationshipTypes: ExportRelationshipType[];
  workflows: ExportWorkflow[];
  dashboards: ExportDashboard[];
  healthChecks: ExportHealthCheck[];
  permissionGroups: ExportPermissionGroup[];
  records: ExportRecord[];
  relationships: ExportRelationship[];
  exportedAt?: Date;
}

/** Sanitize a string for use as a filename / folder segment. */
export function safeFilename(input: string, fallback = "untitled"): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[/\\]+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/[^\w\s.-]+/g, "")
    .replace(/[-.]+/g, (m) => (m.includes("-") ? "-" : "."))
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[-.\s]+|[-.\s]+$/g, "")
    .slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

function wiki(name: string): string {
  return `[[${name}]]`;
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const s = String(value);
  if (/[:#{}[\],&*?|>!%@`'"\\\n]/.test(s) || s.trim() !== s) {
    return JSON.stringify(s);
  }
  return s;
}

function frontmatter(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
      } else {
        lines.push(`${k}:`);
        for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
      }
    } else if (typeof v === "object" && v !== null) {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function typeFolder(rt: ExportRecordType): string {
  return safeFilename(rt.name, rt.key);
}

function recordNoteName(r: ExportRecord): string {
  return safeFilename(r.displayName, r.slug || r.id);
}

function parseFields(raw: unknown): ExportField[] {
  if (!Array.isArray(raw)) return [];
  const out: ExportField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.name !== "string") continue;
    out.push({
      key: o.key,
      name: o.name,
      type: typeof o.type === "string" ? o.type : "text",
      required: Boolean(o.required),
      options: Array.isArray(o.options)
        ? o.options.filter((x): x is string => typeof x === "string")
        : undefined,
    });
  }
  return out;
}

/** Pure builder: vault file map (path → markdown/json text). */
export function buildObsidianVaultFiles(
  input: ObsidianExportInput,
): Map<string, string> {
  const files = new Map<string, string>();
  const exportedAt = (input.exportedAt ?? new Date()).toISOString();
  const typeByKey = new Map(input.recordTypes.map((rt) => [rt.key, rt]));
  const recordById = new Map(input.records.map((r) => [r.id, r]));

  // Group records by type for the home view.
  const recordsByType = new Map<string, ExportRecord[]>();
  for (const r of input.records) {
    const arr = recordsByType.get(r.recordTypeKey) ?? [];
    arr.push(r);
    recordsByType.set(r.recordTypeKey, arr);
  }

  // ── Home.md — data-first company snapshot ──────────────────────────────────
  const typeBlocks: string[] = [];
  for (const rt of input.recordTypes) {
    const recs = recordsByType.get(rt.key) ?? [];
    if (recs.length === 0) continue;
    typeBlocks.push(`### ${rt.name}`);
    typeBlocks.push("");
    for (const r of recs) {
      // Show one key outgoing relationship inline for context.
      const out = input.relationships.filter((rel) => rel.sourceId === r.id);
      const snippet =
        out.length > 0
          ? ` — ${out[0]!.forwardLabel} ${wiki(recordNoteName(recordById.get(out[0]!.targetId)!))}`
          : "";
      typeBlocks.push(`- ${wiki(recordNoteName(r))}${snippet}`);
    }
    typeBlocks.push("");
  }

  files.set(
    "Home.md",
    [
      frontmatter({
        id: input.organization.id,
        type: "organization",
        slug: input.organization.slug,
        exported_at: exportedAt,
      }),
      "",
      `# ${input.organization.name}`,
      "",
      input.organization.description?.trim() || "",
      "",
      `> ${input.records.length} records · ${input.relationships.length} connections · exported ${exportedAt.slice(0, 10)}`,
      "",
      "## Knowledge graph",
      "",
      ...typeBlocks,
      ...(typeBlocks.length === 0 ? ["_No records yet._", ""] : []),
      "---",
      "",
      `See [[_Schema]] for type definitions and relationship types.`,
      "",
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n"),
  );

  // ── README.md ───────────────────────────────────────────────────────────────
  files.set(
    "README.md",
    [
      `# ${input.organization.name} — Obsidian Vault`,
      "",
      "Exported from OrgGraph. Open this folder as a vault in Obsidian.",
      "",
      "1. Unzip this archive.",
      "2. In Obsidian: **Open folder as vault** → select the unzipped folder.",
      "3. Start from [[Home]].",
      "",
      `Records: ${input.records.length} · Relationships: ${input.relationships.length} · Exported: ${exportedAt.slice(0, 10)}`,
      "",
    ].join("\n"),
  );

  // ── Per-record notes organized by type ────────────────────────────────────
  for (const r of input.records) {
    const rt = typeByKey.get(r.recordTypeKey);
    if (!rt) continue;
    const folder = safeFilename(rt.name, rt.key);
    const outgoing = input.relationships.filter((rel) => rel.sourceId === r.id);
    const incoming = input.relationships.filter((rel) => rel.targetId === r.id);

    const valueLines: string[] = [];
    for (const [k, v] of Object.entries(r.values)) {
      if (v === null || v === undefined || v === "") continue;
      const field = rt.fields.find((f) => f.key === k);
      const label = field?.name ?? k;
      valueLines.push(`- **${label}**: ${formatValue(v)}`);
    }

    const outLines = outgoing.map((rel) => {
      const target = recordById.get(rel.targetId);
      if (!target) return null;
      return `- ${rel.forwardLabel} → ${wiki(recordNoteName(target))}`;
    }).filter(Boolean) as string[];

    const inLines = incoming.map((rel) => {
      const source = recordById.get(rel.sourceId);
      if (!source) return null;
      return `- ${wiki(recordNoteName(source))} → ${rel.reverseLabel}`;
    }).filter(Boolean) as string[];

    const relLines = [...outLines, ...inLines];

    files.set(
      `${folder}/${recordNoteName(r)}.md`,
      [
        frontmatter({
          id: r.id,
          type: r.recordTypeKey,
          ...(r.status ? { status: r.status } : {}),
          slug: r.slug,
        }),
        "",
        `# ${r.displayName}`,
        "",
        `> ${rt.name}`,
        "",
        ...(valueLines.length ? ["## Details", "", ...valueLines, ""] : []),
        ...(relLines.length ? ["## Connections", "", ...relLines, ""] : ["_No connections._", ""]),
      ].join("\n"),
    );
  }

  // ── _Schema.md — schema index (one file, not six) ──────────────────────────
  const relTypeLines = input.relationshipTypes.map((rel) => {
    const src = typeByKey.get(rel.sourceTypeKey);
    const tgt = typeByKey.get(rel.targetTypeKey);
    const srcName = src?.name ?? rel.sourceTypeKey;
    const tgtName = tgt?.name ?? rel.targetTypeKey;
    return `| \`${rel.key}\` | ${srcName} | ${rel.forwardLabel} | ${tgtName} | ${rel.cardinality} |`;
  });

  const typeDefLines = input.recordTypes.map((rt) => {
    const count = (recordsByType.get(rt.key) ?? []).length;
    return `| **${rt.name}** | \`${rt.key}\` | ${count} record${count !== 1 ? "s" : ""} |`;
  });

  files.set(
    "_Schema.md",
    [
      frontmatter({ type: "schema_index" }),
      "",
      `# ${input.organization.name} — Schema`,
      "",
      "## Record types",
      "",
      "| Name | Key | Records |",
      "| --- | --- | --- |",
      ...typeDefLines,
      "",
      "## Relationship types",
      "",
      "| Key | From | Label | To | Cardinality |",
      "| --- | --- | --- | --- | --- |",
      ...relTypeLines,
      ...(relTypeLines.length ? [] : ["_None._"]),
      "",
      "## Workflows",
      "",
      ...input.workflows.flatMap((w) => {
        const states = (w.states ?? []).map((s) => s.name).join(" → ");
        return [`- **${w.name}** (\`${w.recordTypeKey}\`): ${states || "—"}`];
      }),
      ...(input.workflows.length ? [] : ["_None._"]),
      "",
    ].join("\n"),
  );

  // ── schema/manifest.json ────────────────────────────────────────────────────
  files.set(
    "_schema/manifest.json",
    JSON.stringify(
      {
        format: "orggraph.obsidian-vault.v2",
        exportedAt,
        organization: {
          id: input.organization.id,
          name: input.organization.name,
          slug: input.organization.slug,
          industryPackKey: input.organization.industryPackKey,
        },
        schemaVersion: input.schemaVersion,
        counts: {
          recordTypes: input.recordTypes.length,
          relationshipTypes: input.relationshipTypes.length,
          records: input.records.length,
          relationships: input.relationships.length,
        },
      },
      null,
      2,
    ),
  );

  return files;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "_empty_";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "`" + JSON.stringify(v) + "`";
}

export function vaultFilesToZipEntries(
  files: Map<string, string>,
): ZipEntry[] {
  return [...files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, content }));
}

export function buildObsidianZip(input: ObsidianExportInput): {
  filename: string;
  bytes: Uint8Array;
  fileCount: number;
} {
  const files = buildObsidianVaultFiles(input);
  const bytes = buildZip(vaultFilesToZipEntries(files));
  const slug = safeFilename(input.organization.slug || input.organization.name, "org");
  return {
    filename: `${slug}-obsidian-vault.zip`,
    bytes,
    fileCount: files.size,
  };
}

/** Helpers for mapping Prisma / JSON rows into the export input shape. */
export function fieldsFromJson(raw: unknown): ExportField[] {
  return parseFields(raw);
}

export function widgetsFromJson(raw: unknown): ExportDashboard["widgets"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => {
    const o = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
    return {
      kind: typeof o.kind === "string" ? o.kind : undefined,
      title: typeof o.title === "string" ? o.title : undefined,
      label: typeof o.label === "string" ? o.label : undefined,
    };
  });
}

export function statesFromWorkflowJson(
  raw: unknown,
): ExportWorkflow["states"] {
  if (!raw || typeof raw !== "object") return [];
  const states = (raw as { states?: unknown }).states;
  if (!Array.isArray(states)) return [];
  const out: ExportWorkflow["states"] = [];
  for (const s of states) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.name !== "string") continue;
    out.push({
      key: typeof o.key === "string" ? o.key : undefined,
      name: o.name,
    });
  }
  return out;
}
