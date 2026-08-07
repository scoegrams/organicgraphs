/**
 * Declarative graph inference.
 *
 * Instead of hand-writing `if (typeKey === "vendor" && ...)` branches per pack,
 * a pack declares *path patterns*: "walk these edges, and if you land somewhere,
 * that endpoint deserves an edge of this type."
 *
 * Every inferred edge remembers the rule that produced it and how many distinct
 * paths support it, so the same engine can retract edges once their supporting
 * paths are gone.
 */

export type GraphEdge = {
  relationshipTypeKey: string;
  sourceId: string;
  targetId: string;
};

export type GraphNode = {
  id: string;
  typeKey: string;
  displayName?: string;
  values?: Record<string, unknown> | null;
};

/**
 * One step along a path. `forward` follows a stored edge from its source to its
 * target; `reverse` walks the same edge backwards. Reverse traversal never
 * implies a reversed stored edge — it is read-only navigation.
 */
export type Hop = {
  rel: string;
  dir: "forward" | "reverse";
};

export interface InferenceRule {
  /** Stable id persisted on produced edges so they can be recomputed later. */
  key: string;
  /** Relationship type to create between the path's start and end node. */
  infers: string;
  /** Type the start node must have. */
  sourceType: string;
  /** Type the end node must have. */
  targetType: string;
  /** Hops walked from the start node to reach the end node. */
  path: Hop[];
  /**
   * Optional final check on the two endpoints. Path shape alone cannot express
   * value-level constraints such as "only hosting vendors host repositories".
   */
  guard?: (source: GraphNode, target: GraphNode) => boolean;
  /**
   * Drop the rule's output for a node that would gain more than this many
   * edges at once. A conclusion that points at twenty things is not telling
   * you anything about any of them, and it is how a graph turns into a
   * hairball. Defaults to no limit.
   */
  maxFanOut?: number;
  /** Confidence for a single supporting path, 0..1. */
  baseConfidence: number;
  /** Human-readable reason surfaced in the inspector. */
  rationale: string;
  /**
   * When true, the edge is removed once no supporting path remains. Derived
   * shortcuts should be retractable; heuristics a human may have curated
   * should not.
   */
  retractable: boolean;
}

export interface InferredEdge {
  relationshipTypeKey: string;
  sourceId: string;
  targetId: string;
  ruleKey: string;
  /** Number of distinct paths that justify this edge. */
  support: number;
  confidence: number;
  rationale: string;
}

type Adjacency = Map<string, { forward: Map<string, string[]>; reverse: Map<string, string[]> }>;

function buildAdjacency(edges: GraphEdge[]): Adjacency {
  const adj: Adjacency = new Map();
  const touch = (id: string) => {
    let entry = adj.get(id);
    if (!entry) {
      entry = { forward: new Map(), reverse: new Map() };
      adj.set(id, entry);
    }
    return entry;
  };

  for (const e of edges) {
    const from = touch(e.sourceId);
    const to = touch(e.targetId);
    const outs = from.forward.get(e.relationshipTypeKey) ?? [];
    outs.push(e.targetId);
    from.forward.set(e.relationshipTypeKey, outs);

    const ins = to.reverse.get(e.relationshipTypeKey) ?? [];
    ins.push(e.sourceId);
    to.reverse.set(e.relationshipTypeKey, ins);
  }
  return adj;
}

/**
 * More supporting paths means more confidence, with diminishing returns and a
 * hard ceiling below 1 — an inferred edge is never as certain as a stated one.
 */
function scoreConfidence(base: number, support: number): number {
  const boosted = base + (1 - base) * (1 - 1 / (1 + Math.log2(1 + support)));
  return Math.min(0.98, Math.round(boosted * 100) / 100);
}

function edgeId(rel: string, sourceId: string, targetId: string): string {
  return `${rel}\u0000${sourceId}\u0000${targetId}`;
}

/**
 * Two rules reaching the same conclusion by different routes is stronger
 * evidence than either alone, so their confidences combine as independent
 * observations rather than one simply overwriting the other.
 */
function corroborate(a: InferredEdge, b: InferredEdge): InferredEdge {
  if (a.ruleKey === b.ruleKey) {
    return a.confidence >= b.confidence ? a : b;
  }
  const combined = 1 - (1 - a.confidence) * (1 - b.confidence);
  const stronger = a.confidence >= b.confidence ? a : b;
  const weaker = stronger === a ? b : a;
  return {
    ...stronger,
    support: a.support + b.support,
    confidence: Math.min(0.98, Math.round(combined * 100) / 100),
    rationale: `${stronger.rationale}; also ${weaker.rationale.toLowerCase()}`,
  };
}

/**
 * Walks every rule once over the graph and returns the edges the rules justify.
 * Paths are simple (a node is never revisited within one walk), so cyclic
 * regions cannot blow up the search.
 */
function inferOnce(
  rules: InferenceRule[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { allowSelfEdges?: Set<string> } = {},
): InferredEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = buildAdjacency(edges);
  const existing = new Set(edges.map((e) => edgeId(e.relationshipTypeKey, e.sourceId, e.targetId)));
  const selfOk = options.allowSelfEdges ?? new Set<string>();

  const found = new Map<string, InferredEdge>();

  for (const rule of rules) {
    if (rule.path.length === 0) continue;

    for (const start of nodes) {
      if (start.typeKey !== rule.sourceType) continue;

      // Each frontier entry is one distinct path in progress. Duplicate
      // endpoints are kept so support counts reflect real path multiplicity.
      let frontier: { at: string; seen: Set<string> }[] = [
        { at: start.id, seen: new Set([start.id]) },
      ];

      for (const hop of rule.path) {
        const next: { at: string; seen: Set<string> }[] = [];
        for (const step of frontier) {
          const entry = adj.get(step.at);
          if (!entry) continue;
          const neighbors = (hop.dir === "forward" ? entry.forward : entry.reverse).get(hop.rel);
          if (!neighbors) continue;
          for (const id of neighbors) {
            if (step.seen.has(id)) continue;
            const seen = new Set(step.seen);
            seen.add(id);
            next.push({ at: id, seen });
          }
        }
        frontier = next;
        if (frontier.length === 0) break;
      }

      // Collected per start node so the fan-out limit can reject the whole
      // batch before any of it reaches the graph.
      const fromStart = new Map<string, InferredEdge>();
      for (const end of frontier) {
        const endNode = byId.get(end.at);
        if (!endNode || endNode.typeKey !== rule.targetType) continue;
        if (end.at === start.id && !selfOk.has(rule.infers)) continue;
        if (rule.guard && !rule.guard(start, endNode)) continue;
        const id = edgeId(rule.infers, start.id, end.at);
        if (existing.has(id)) continue;

        const prior = fromStart.get(id);
        if (prior) {
          prior.support += 1;
          prior.confidence = scoreConfidence(rule.baseConfidence, prior.support);
        } else {
          fromStart.set(id, {
            relationshipTypeKey: rule.infers,
            sourceId: start.id,
            targetId: end.at,
            ruleKey: rule.key,
            support: 1,
            confidence: scoreConfidence(rule.baseConfidence, 1),
            rationale: rule.rationale,
          });
        }
      }

      if (rule.maxFanOut !== undefined && fromStart.size > rule.maxFanOut) continue;
      for (const [id, edge] of fromStart) {
        const prior = found.get(id);
        found.set(id, prior ? corroborate(prior, edge) : edge);
      }
    }
  }

  return [...found.values()];
}

/** Each round of chained reasoning is held to be less certain than the last. */
const CHAIN_DECAY = 0.85;
const MAX_ROUNDS = 4;

/**
 * Runs inference to a fixpoint so rules can build on each other — owning a
 * feature makes you a member of its product, which in turn makes you a user of
 * that product's providers.
 *
 * Confidence decays each round, so a conclusion three hops of reasoning deep
 * never outranks a directly supported one.
 */
export function runInference(
  rules: InferenceRule[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { allowSelfEdges?: Set<string> } = {},
): InferredEdge[] {
  const accumulated = new Map<string, InferredEdge>();
  let working = edges;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const batch = inferOnce(rules, nodes, working, options);
    const decay = CHAIN_DECAY ** round;

    let added = false;
    for (const found of batch) {
      const id = edgeId(found.relationshipTypeKey, found.sourceId, found.targetId);
      const prior = accumulated.get(id);
      const scored = { ...found, confidence: Math.round(found.confidence * decay * 100) / 100 };
      // Keep the strongest justification when several rounds reach the same edge.
      if (!prior) {
        accumulated.set(id, scored);
        added = true;
      } else if (scored.confidence > prior.confidence) {
        accumulated.set(id, scored);
      }
    }
    if (!added) break;

    working = [
      ...edges,
      ...[...accumulated.values()].map((e) => ({
        relationshipTypeKey: e.relationshipTypeKey,
        sourceId: e.sourceId,
        targetId: e.targetId,
      })),
    ];
  }

  return [...accumulated.values()];
}

/**
 * Recomputes inference against the current graph and reports which previously
 * inferred edges no longer have support. Only edges from retractable rules are
 * ever returned, so a human-confirmed edge is never yanked away.
 */
export function unsupportedInferredEdges(
  rules: InferenceRule[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  inferredEdges: (GraphEdge & { ruleKey?: string | null })[],
): GraphEdge[] {
  const retractable = new Map(rules.filter((r) => r.retractable).map((r) => [r.key, r]));
  const candidates = inferredEdges.filter((e) => e.ruleKey && retractable.has(e.ruleKey));
  if (candidates.length === 0) return [];

  // Inference must run against the graph *without* the derived edges, otherwise
  // a shortcut could justify itself through another shortcut.
  const derived = new Set(candidates.map((e) => edgeId(e.relationshipTypeKey, e.sourceId, e.targetId)));
  const base = edges.filter((e) => !derived.has(edgeId(e.relationshipTypeKey, e.sourceId, e.targetId)));

  const supported = new Set(
    runInference([...retractable.values()], nodes, base).map((e) =>
      edgeId(e.relationshipTypeKey, e.sourceId, e.targetId),
    ),
  );

  return candidates
    .filter((e) => !supported.has(edgeId(e.relationshipTypeKey, e.sourceId, e.targetId)))
    .map(({ relationshipTypeKey, sourceId, targetId }) => ({
      relationshipTypeKey,
      sourceId,
      targetId,
    }));
}
