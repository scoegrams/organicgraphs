/**
 * Build an editor-native "AI brain" from a generated workspace graph:
 *  - AGENTS.md                     — portable context most agents read
 *  - .cursor/rules/company-brain.mdc — Cursor auto-loads it while you code
 *
 * Both are generated from the same records + relationships, so the AI in your
 * editor knows who owns what, what runs where, and what it all costs.
 */

import type { ZipEntry } from "@/lib/zip";
import { buildZip } from "@/lib/zip";
import { safeFilename } from "@/lib/obsidian-export";
import type {
  ExportRecord,
  ExportRelationship,
  ExportRecordType,
  ExportRelationshipType,
} from "@/lib/obsidian-export";

export interface BrainExportInput {
  organization: {
    name: string;
    slug: string;
    description: string | null;
    industryPackKey: string | null;
  };
  recordTypes: ExportRecordType[];
  relationshipTypes: ExportRelationshipType[];
  records: ExportRecord[];
  relationships: ExportRelationship[];
  exportedAt?: Date;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Index that resolves relationship endpoints to record display names. */
class Graph {
  private byId = new Map<string, ExportRecord>();
  private byType = new Map<string, ExportRecord[]>();

  constructor(
    private records: ExportRecord[],
    private relationships: ExportRelationship[],
  ) {
    for (const r of records) {
      this.byId.set(r.id, r);
      const list = this.byType.get(r.recordTypeKey) ?? [];
      list.push(r);
      this.byType.set(r.recordTypeKey, list);
    }
  }

  ofType(key: string): ExportRecord[] {
    return this.byType.get(key) ?? [];
  }

  name(id: string): string {
    return this.byId.get(id)?.displayName ?? id;
  }

  /** Display names of records this source points to via relKey. */
  targets(relKey: string, sourceId: string): string[] {
    return this.relationships
      .filter((r) => r.relationshipTypeKey === relKey && r.sourceId === sourceId)
      .map((r) => this.name(r.targetId));
  }

  /** Display names of records that point to this target via relKey. */
  sources(relKey: string, targetId: string): string[] {
    return this.relationships
      .filter((r) => r.relationshipTypeKey === relKey && r.targetId === targetId)
      .map((r) => this.name(r.sourceId));
  }
}

function joinOr(names: string[]): string | undefined {
  return names.length ? names.join(", ") : undefined;
}

/** Build the human/AI-readable body sections shared by both artifacts. */
function buildSections(input: BrainExportInput): string[] {
  const g = new Graph(input.records, input.relationships);
  const sections: string[] = [];

  // Overview
  const covered = new Set(["person", "service", "vendor", "feature", "product"]);
  const overview = input.recordTypes
    .map((rt) => ({ rt, n: g.ofType(rt.key).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.rt.name}${x.n === 1 ? "" : "s"}`.toLowerCase());
  if (overview.length) {
    sections.push(`## Overview\n\n${input.organization.name} tracks ${overview.join(", ")}.`);
  }
  if (input.organization.description) {
    sections.push(`> ${input.organization.description}`);
  }

  // People
  const people = g.ofType("person");
  if (people.length) {
    const lines = people.map((p) => {
      const role = str((p.values ?? {})["role"]);
      const reportsTo = joinOr(g.targets("person_reports_to", p.id));
      const parts = [role ? `_${role}_` : null, reportsTo ? `reports to ${reportsTo}` : null]
        .filter(Boolean)
        .join(" · ");
      return `- **${p.displayName}**${parts ? ` — ${parts}` : ""}`;
    });
    sections.push(`## People\n\n${lines.join("\n")}`);
  }

  // Apps / services
  const services = g.ofType("service");
  if (services.length) {
    const lines = services.map((s) => {
      const status = s.status ?? str((s.values ?? {})["status"]);
      const hosted = joinOr(g.targets("service_hosted_on_vendor", s.id));
      const monitored = joinOr(g.targets("service_monitored_by_vendor", s.id));
      const features = joinOr(g.sources("feature_in_service", s.id));
      const parts = [
        status ? `status: ${status}` : null,
        hosted ? `hosted on ${hosted}` : null,
        monitored ? `monitored by ${monitored}` : null,
        features ? `runs ${features}` : null,
      ].filter(Boolean);
      return `- **${s.displayName}**${parts.length ? ` — ${parts.join("; ")}` : ""}`;
    });
    sections.push(`## Apps & services\n\n${lines.join("\n")}`);
  }

  // Vendors & spend
  const vendors = g.ofType("vendor");
  if (vendors.length) {
    const byCategory = new Map<string, ExportRecord[]>();
    for (const v of vendors) {
      const c = str((v.values ?? {})["category"]) ?? "Other";
      const list = byCategory.get(c) ?? [];
      list.push(v);
      byCategory.set(c, list);
    }
    let monthly = 0;
    const catLines: string[] = [];
    for (const [category, list] of [...byCategory.entries()].sort()) {
      const items = list.map((v) => {
        const cost = num((v.values ?? {})["cost"]);
        const cycle = str((v.values ?? {})["cycle"]);
        if (cost && cycle === "Monthly") monthly += cost;
        const meta = [cost ? `$${cost}` : null, cycle].filter(Boolean).join(" ");
        return meta ? `${v.displayName} (${meta})` : v.displayName;
      });
      catLines.push(`- **${category}:** ${items.join(", ")}`);
    }
    const total = monthly > 0 ? `\n\nKnown recurring monthly spend: ~$${monthly}/mo.` : "";
    sections.push(`## Vendors & subscriptions\n\n${catLines.join("\n")}${total}`);
  }

  // Features
  const features = g.ofType("feature");
  if (features.length) {
    const lines = features.map((f) => {
      const status = f.status ?? str((f.values ?? {})["status"]);
      const owner = joinOr(g.sources("person_owns_feature", f.id));
      const service = joinOr(g.targets("feature_in_service", f.id));
      const parts = [
        owner ? `owned by ${owner}` : "unowned",
        service ? `runs in ${service}` : null,
        status ? `status: ${status}` : null,
      ].filter(Boolean);
      return `- **${f.displayName}**${parts.length ? ` — ${parts.join("; ")}` : ""}`;
    });
    sections.push(`## Features\n\n${lines.join("\n")}`);
  }

  // Anything else (generic fallback so other packs degrade gracefully)
  for (const rt of input.recordTypes) {
    if (covered.has(rt.key)) continue;
    const rows = g.ofType(rt.key);
    if (!rows.length) continue;
    const lines = rows.map((r) => `- ${r.displayName}${r.status ? ` (${r.status})` : ""}`);
    sections.push(`## ${rt.name}\n\n${lines.join("\n")}`);
  }

  return sections;
}

/** Pure builder: the two brain files as path → text. */
export function buildBrainFiles(input: BrainExportInput): Map<string, string> {
  const exportedAt = (input.exportedAt ?? new Date()).toISOString();
  const sections = buildSections(input);
  const files = new Map<string, string>();

  const header = [
    `# ${input.organization.name} — company brain`,
    "",
    "Operating context generated from the OrgGraph knowledge graph: who works here,",
    "what apps run where, which vendors power them, and how features connect. Keep this",
    "file in your repo so your AI assistant understands the company while you code.",
    "",
    `_Generated ${exportedAt}._`,
    "",
  ].join("\n");

  const body = sections.join("\n\n");

  files.set("AGENTS.md", `${header}\n${body}\n`);

  const mdc = [
    "---",
    `description: Operating context for ${input.organization.name} — people, apps, hosting, vendors, and features.`,
    "alwaysApply: true",
    "---",
    "",
    `# ${input.organization.name} company brain`,
    "",
    "Use this org context when reasoning about the codebase.",
    "",
    body,
    "",
  ].join("\n");

  files.set(".cursor/rules/company-brain.mdc", mdc);

  return files;
}

/** Build the downloadable ZIP for the AI brain. */
export function buildBrainZip(input: BrainExportInput): {
  filename: string;
  bytes: Uint8Array;
  fileCount: number;
} {
  const files = buildBrainFiles(input);
  const entries: ZipEntry[] = [...files.entries()].map(([path, content]) => ({
    path,
    content,
  }));
  const bytes = buildZip(entries);
  const slug = safeFilename(input.organization.slug || input.organization.name, "org");
  return {
    filename: `${slug}-ai-brain.zip`,
    bytes,
    fileCount: files.size,
  };
}
