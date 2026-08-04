// ---------------------------------------------------------------------------
// Graph fill proposals (pure, no server/prisma imports so it is unit-testable).
//
// A "proposal" is a small set of candidate records + relationships that the user
// reviews before anything is written. Two producers feed the same shape:
//   1. expandNode — scaffolds the typical neighbours of a node from the schema.
//   2. parseRepo  — extracts concrete nodes from a pasted package.json / file list.
// When an AI key is present, the server may replace/augment these with concrete,
// model-generated suggestions. Either way the applied writes are marked
// unreviewed + sourceAttribution "ai" so nothing lands unchecked.
// ---------------------------------------------------------------------------

export interface SchemaField {
  key: string;
  name: string;
  type: string;
  options?: string[];
}
export interface SchemaType {
  key: string;
  name: string;
  fields: SchemaField[];
}
export interface SchemaRelationship {
  key: string;
  sourceTypeKey: string;
  targetTypeKey: string;
  forwardLabel: string;
  reverseLabel: string;
}
export interface GraphSchema {
  types: SchemaType[];
  relationshipTypes: SchemaRelationship[];
}

export interface ExistingNode {
  id: string;
  name: string;
  typeKey: string;
  typeName: string;
}

/**
 * A single suggested node and how it connects back to the anchor. `direction`
 * is relative to the NEW node: "outgoing" means the new node is the source.
 */
export interface NodeSuggestion {
  recordTypeKey: string;
  displayName: string;
  relationshipTypeKey: string;
  direction: "outgoing" | "incoming";
  values?: Record<string, unknown>;
  rationale?: string;
  confidence: number;
}

export interface ProposedNode {
  tempId: string;
  recordTypeKey: string;
  displayName: string;
  values?: Record<string, unknown>;
  rationale?: string;
  confidence: number;
}
export interface ProposedEdge {
  relationshipTypeKey: string;
  /** "new:<tempId>" or "existing:<recordId>" */
  sourceRef: string;
  targetRef: string;
  rationale?: string;
}
export interface ProposalSet {
  summary: string;
  nodes: ProposedNode[];
  edges: ProposedEdge[];
  source: "deterministic" | "openai";
}

export function refIsNew(ref: string): boolean {
  return ref.startsWith("new:");
}
export function refId(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

/**
 * Convert anchor-relative node suggestions into a review-ready ProposalSet.
 * Suggestions whose relationship/type keys don't line up with the schema (in
 * the claimed direction) are dropped — we never fabricate invalid edges.
 */
export function toProposalSet(
  anchor: ExistingNode,
  suggestions: NodeSuggestion[],
  schema: GraphSchema,
  source: ProposalSet["source"],
  summary: string,
): ProposalSet {
  const relByKey = new Map(schema.relationshipTypes.map((r) => [r.key, r]));
  const typeExists = new Set(schema.types.map((t) => t.key));
  const nodes: ProposedNode[] = [];
  const edges: ProposedEdge[] = [];
  let i = 0;

  for (const s of suggestions) {
    const rel = relByKey.get(s.relationshipTypeKey);
    if (!rel || !typeExists.has(s.recordTypeKey)) continue;

    // Validate that the relationship actually links the new node's type and
    // the anchor's type in the requested direction.
    const newIsSource = s.direction === "outgoing";
    const okSource = newIsSource ? rel.sourceTypeKey : rel.targetTypeKey;
    const okTarget = newIsSource ? rel.targetTypeKey : rel.sourceTypeKey;
    if (okSource !== s.recordTypeKey || okTarget !== anchor.typeKey) continue;

    const tempId = `n${i++}`;
    nodes.push({
      tempId,
      recordTypeKey: s.recordTypeKey,
      displayName: s.displayName ?? "",
      values: s.values,
      rationale: s.rationale,
      confidence: s.confidence,
    });
    edges.push({
      relationshipTypeKey: rel.key,
      sourceRef: newIsSource ? `new:${tempId}` : `existing:${anchor.id}`,
      targetRef: newIsSource ? `existing:${anchor.id}` : `new:${tempId}`,
      rationale: s.rationale,
    });
  }

  return { summary, nodes, edges, source: "deterministic" === source ? "deterministic" : "openai" };
}

/**
 * Deterministic expansion: for each relationship type touching the anchor's
 * type, offer one blank candidate of the neighbouring type. Names are left for
 * the user to fill (or the model to complete) — this is scaffolding, not
 * invention.
 */
export function expandNodeSuggestions(
  anchor: ExistingNode,
  schema: GraphSchema,
): NodeSuggestion[] {
  const typeName = new Map(schema.types.map((t) => [t.key, t.name]));
  const out: NodeSuggestion[] = [];
  const seen = new Set<string>();

  for (const r of schema.relationshipTypes) {
    const outgoing = r.sourceTypeKey === anchor.typeKey; // anchor is source
    const incoming = r.targetTypeKey === anchor.typeKey; // anchor is target
    if (!outgoing && !incoming) continue;

    // From the NEW node's perspective the direction is the opposite of the
    // anchor's role in the relationship.
    if (outgoing) {
      const otherKey = r.targetTypeKey;
      const dedupe = `${otherKey}:${r.key}:incoming`;
      if (!seen.has(dedupe) && typeName.has(otherKey)) {
        seen.add(dedupe);
        out.push({
          recordTypeKey: otherKey,
          displayName: "",
          relationshipTypeKey: r.key,
          direction: "incoming",
          rationale: `${anchor.name} ${r.forwardLabel} ${typeName.get(otherKey)}`,
          confidence: 0.3,
        });
      }
    }
    if (incoming) {
      const otherKey = r.sourceTypeKey;
      const dedupe = `${otherKey}:${r.key}:outgoing`;
      if (!seen.has(dedupe) && typeName.has(otherKey)) {
        seen.add(dedupe);
        out.push({
          recordTypeKey: otherKey,
          displayName: "",
          relationshipTypeKey: r.key,
          direction: "outgoing",
          rationale: `${typeName.get(otherKey)} ${r.reverseLabel} ${anchor.name}`,
          confidence: 0.3,
        });
      }
    }
  }
  return out;
}

/** Find the first type whose key or name matches a pattern. */
export function pickType(schema: GraphSchema, re: RegExp): SchemaType | undefined {
  return schema.types.find((t) => re.test(t.key) || re.test(t.name));
}

/** Find a relationship linking `aType` and `bType` (either orientation). */
function findRel(
  schema: GraphSchema,
  aType: string,
  bType: string,
): { rel: SchemaRelationship; aIsSource: boolean } | undefined {
  for (const r of schema.relationshipTypes) {
    if (r.sourceTypeKey === aType && r.targetTypeKey === bType) {
      return { rel: r, aIsSource: true };
    }
    if (r.sourceTypeKey === bType && r.targetTypeKey === aType) {
      return { rel: r, aIsSource: false };
    }
  }
  return undefined;
}

const STOP_DEPS = new Set([
  "react",
  "react-dom",
  "next",
  "typescript",
  "eslint",
  "vitest",
  "tailwindcss",
  "postcss",
  "autoprefixer",
]);

/**
 * Deterministic repo extraction. The anchor is the Product these nodes belong
 * to. Understands package.json dependencies (→ providers/subscriptions) and a
 * pasted file listing (paths under a features/ or app/ dir → feature nodes).
 */
export function parseRepoSuggestions(
  text: string,
  anchor: ExistingNode,
  schema: GraphSchema,
): NodeSuggestion[] {
  const out: NodeSuggestion[] = [];
  const vendorType = pickType(schema, /vendor|provider|subscription|tool/i);
  const featureType = pickType(schema, /feature/i);

  // package.json dependencies → provider nodes.
  if (vendorType) {
    try {
      const json = JSON.parse(text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(json.dependencies ?? {}),
        ...(json.devDependencies ?? {}),
      };
      const link = findRel(schema, vendorType.key, anchor.typeKey);
      for (const name of Object.keys(deps)) {
        if (STOP_DEPS.has(name) || name.startsWith("@types/")) continue;
        if (!link) break;
        out.push({
          recordTypeKey: vendorType.key,
          displayName: name,
          relationshipTypeKey: link.rel.key,
          direction: link.aIsSource ? "outgoing" : "incoming",
          rationale: `Dependency in package.json`,
          confidence: 0.55,
        });
      }
    } catch {
      // Not JSON — fall through to path parsing.
    }
  }

  // File paths → feature nodes (routes / feature folders).
  if (featureType && out.length === 0) {
    const link = findRel(schema, featureType.key, anchor.typeKey);
    const names = new Set<string>();
    for (const raw of text.split(/[\n,]/)) {
      const line = raw.trim();
      const m =
        line.match(/(?:^|\/)features?\/([a-z0-9-_]+)/i) ||
        line.match(/(?:^|\/)app\/(?:\([a-z-]+\)\/)?([a-z0-9-_]+)\/(?:page|route)\.[jt]sx?/i) ||
        line.match(/(?:^|\/)routes?\/([a-z0-9-_]+)/i);
      if (m && m[1]) names.add(m[1]);
    }
    for (const n of names) {
      if (!link) break;
      out.push({
        recordTypeKey: featureType.key,
        displayName: humanize(n),
        relationshipTypeKey: link.rel.key,
        direction: link.aIsSource ? "outgoing" : "incoming",
        rationale: "Detected from file path",
        confidence: 0.5,
      });
    }
  }

  return out;
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
