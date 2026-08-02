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
  return `types/${safeFilename(rt.name, rt.key)}`;
}

function typeNoteName(rt: ExportRecordType): string {
  return `_Type — ${safeFilename(rt.name, rt.key)}`;
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

  files.set(
    "README.md",
    [
      `# ${input.organization.name}`,
      "",
      "Obsidian vault exported from OrgGraph for testing and portable review.",
      "",
      "## How to open",
      "",
      "1. Unzip this archive.",
      "2. In Obsidian: **Open folder as vault** → select the unzipped folder.",
      "3. Start from [[Home]] or browse `types/`.",
      "",
      "## What's included",
      "",
      `- Organization: ${input.organization.name}`,
      `- Schema version: ${input.schemaVersion}`,
      `- Industry pack: ${input.organization.industryPackKey ?? "none"}`,
      `- Record types: ${input.recordTypes.length}`,
      `- Relationship types: ${input.relationshipTypes.length}`,
      `- Records: ${input.records.length}`,
      `- Relationships: ${input.relationships.length}`,
      `- Exported at: ${exportedAt}`,
      "",
      "Stable OrgGraph IDs live in YAML frontmatter (`id`, `type`).",
      "Wiki links use display names so the graph is readable in Obsidian.",
      "",
    ].join("\n"),
  );

  const typeLinks = input.recordTypes.map(
    (rt) => `- ${wiki(typeNoteName(rt))} (${rt.key})`,
  );

  files.set(
    "Home.md",
    [
      frontmatter({
        id: input.organization.id,
        type: "organization",
        slug: input.organization.slug,
        schema_version: input.schemaVersion,
        industry_pack: input.organization.industryPackKey,
        exported_at: exportedAt,
      }),
      "",
      `# ${input.organization.name}`,
      "",
      input.organization.description?.trim() ||
        "_No organization description._",
      "",
      "## Record types",
      "",
      ...(typeLinks.length ? typeLinks : ["_None._"]),
      "",
      "## Schema index",
      "",
      `- ${wiki("Schema — Record types")}`,
      `- ${wiki("Schema — Relationship types")}`,
      `- ${wiki("Schema — Workflows")}`,
      `- ${wiki("Schema — Dashboards")}`,
      `- ${wiki("Schema — Health checks")}`,
      `- ${wiki("Schema — Permission groups")}`,
      "",
      `Records in this export: **${input.records.length}**`,
      "",
    ].join("\n"),
  );

  // Per-type definition notes + folder placeholders
  for (const rt of input.recordTypes) {
    const folder = typeFolder(rt);
    const related = input.relationshipTypes.filter(
      (rel) =>
        rel.sourceTypeKey === rt.key || rel.targetTypeKey === rt.key,
    );
    const fieldLines = rt.fields.map((f) => {
      const req = f.required ? " (required)" : "";
      const opts = f.options?.length ? ` — ${f.options.join(", ")}` : "";
      return `- **${f.name}** (\`${f.key}\`): ${f.type}${req}${opts}`;
    });
    const relLines = related.map((rel) => {
      const source = typeByKey.get(rel.sourceTypeKey);
      const target = typeByKey.get(rel.targetTypeKey);
      const sourceName = source ? typeNoteName(source) : rel.sourceTypeKey;
      const targetName = target ? typeNoteName(target) : rel.targetTypeKey;
      return `- ${wiki(sourceName)} *${rel.forwardLabel}* ${wiki(targetName)} (\`${rel.key}\`, ${rel.cardinality})`;
    });

    files.set(
      `${folder}/${typeNoteName(rt)}.md`,
      [
        frontmatter({
          id: `type_${rt.key}`,
          type: "record_type",
          key: rt.key,
          sensitivity: rt.sensitivity,
        }),
        "",
        `# ${rt.name}`,
        "",
        rt.description?.trim() || "_No description._",
        "",
        "## Fields",
        "",
        ...(fieldLines.length ? fieldLines : ["_No fields._"]),
        "",
        "## Relationships",
        "",
        ...(relLines.length ? relLines : ["_No relationship types._"]),
        "",
        "## Records",
        "",
        ...input.records
          .filter((r) => r.recordTypeKey === rt.key)
          .map((r) => `- ${wiki(recordNoteName(r))}`),
        ...(input.records.some((r) => r.recordTypeKey === rt.key)
          ? []
          : ["_No records yet — schema-only export._"]),
        "",
      ].join("\n"),
    );
  }

  // Record notes
  for (const r of input.records) {
    const rt = typeByKey.get(r.recordTypeKey);
    if (!rt) continue;
    const folder = typeFolder(rt);
    const outgoing = input.relationships.filter((rel) => rel.sourceId === r.id);
    const incoming = input.relationships.filter((rel) => rel.targetId === r.id);

    const valueLines = Object.entries(r.values).map(([k, v]) => {
      const field = rt.fields.find((f) => f.key === k);
      const label = field?.name ?? k;
      return `- **${label}**: ${formatValue(v)}`;
    });

    const relLines = [
      ...outgoing.map((rel) => {
        const target = recordById.get(rel.targetId);
        const label = rel.forwardLabel || rel.relationshipTypeKey;
        return target
          ? `- ${label} ${wiki(recordNoteName(target))}`
          : `- ${label} _(missing target)_`;
      }),
      ...incoming.map((rel) => {
        const source = recordById.get(rel.sourceId);
        return source
          ? `- linked from ${wiki(recordNoteName(source))} (\`${rel.relationshipTypeKey}\`)`
          : `- linked from _(missing source)_`;
      }),
    ];

    files.set(
      `${folder}/${recordNoteName(r)}.md`,
      [
        frontmatter({
          id: r.id,
          type: r.recordTypeKey,
          status: r.status,
          archived: r.archived,
          slug: r.slug,
        }),
        "",
        `# ${r.displayName}`,
        "",
        `Type: ${wiki(typeNoteName(rt))}`,
        "",
        "## Fields",
        "",
        ...(valueLines.length ? valueLines : ["_No field values._"]),
        "",
        "## Relationships",
        "",
        ...(relLines.length ? relLines : ["_No relationships._"]),
        "",
      ].join("\n"),
    );
  }

  files.set(
    "Schema — Record types.md",
    [
      frontmatter({ type: "schema_index", kind: "record_types" }),
      "",
      "# Record types",
      "",
      ...input.recordTypes.map(
        (rt) =>
          `- ${wiki(typeNoteName(rt))} — \`${rt.key}\`${rt.description ? `: ${rt.description}` : ""}`,
      ),
      "",
    ].join("\n"),
  );

  files.set(
    "Schema — Relationship types.md",
    [
      frontmatter({ type: "schema_index", kind: "relationship_types" }),
      "",
      "# Relationship types",
      "",
      ...input.relationshipTypes.map((rel) => {
        const source = typeByKey.get(rel.sourceTypeKey);
        const target = typeByKey.get(rel.targetTypeKey);
        return `- **${rel.forwardLabel}** (\`${rel.key}\`): ${source ? wiki(typeNoteName(source)) : rel.sourceTypeKey} → ${target ? wiki(typeNoteName(target)) : rel.targetTypeKey} (${rel.cardinality})`;
      }),
      "",
    ].join("\n"),
  );

  files.set(
    "Schema — Workflows.md",
    [
      frontmatter({ type: "schema_index", kind: "workflows" }),
      "",
      "# Workflows",
      "",
      ...input.workflows.flatMap((w) => [
        `## ${w.name}`,
        "",
        `Record type: \`${w.recordTypeKey}\``,
        "",
        (w.states ?? []).map((s) => s.name).join(" → ") || "_No states._",
        "",
      ]),
      ...(input.workflows.length ? [] : ["_None._", ""]),
    ].join("\n"),
  );

  files.set(
    "Schema — Dashboards.md",
    [
      frontmatter({ type: "schema_index", kind: "dashboards" }),
      "",
      "# Dashboards",
      "",
      ...input.dashboards.flatMap((d) => [
        `## ${d.name}`,
        "",
        ...(d.widgets.length
          ? d.widgets.map(
              (w) =>
                `- ${w.title ?? w.label ?? w.kind ?? "widget"}`,
            )
          : ["_No widgets._"]),
        "",
      ]),
      ...(input.dashboards.length ? [] : ["_None._", ""]),
    ].join("\n"),
  );

  files.set(
    "Schema — Health checks.md",
    [
      frontmatter({ type: "schema_index", kind: "health_checks" }),
      "",
      "# Health checks",
      "",
      ...input.healthChecks.map(
        (h) =>
          `- **${h.name}** (${h.severity})${h.explanation ? `: ${h.explanation}` : ""}`,
      ),
      ...(input.healthChecks.length ? [] : ["_None._"]),
      "",
    ].join("\n"),
  );

  files.set(
    "Schema — Permission groups.md",
    [
      frontmatter({ type: "schema_index", kind: "permission_groups" }),
      "",
      "# Permission groups",
      "",
      ...input.permissionGroups.map(
        (g) =>
          `- **${g.name}** (\`${g.key}\`)${g.description ? `: ${g.description}` : ""}`,
      ),
      ...(input.permissionGroups.length ? [] : ["_None._"]),
      "",
    ].join("\n"),
  );

  files.set(
    "schema/manifest.json",
    JSON.stringify(
      {
        format: "orggraph.obsidian-vault.v1",
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
          workflows: input.workflows.length,
          dashboards: input.dashboards.length,
          healthChecks: input.healthChecks.length,
          permissionGroups: input.permissionGroups.length,
          records: input.records.length,
          relationships: input.relationships.length,
        },
        recordTypes: input.recordTypes.map((rt) => ({
          key: rt.key,
          name: rt.name,
        })),
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
