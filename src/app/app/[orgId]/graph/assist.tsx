"use client";

import { useMemo, useState, useTransition } from "react";
import {
  applyProposals,
  proposeGraphFill,
  type AcceptedEdge,
  type AcceptedNode,
} from "./actions";
import type { GraphPayload } from "./graph-explorer";
import type { ProposalSet } from "@/lib/graph/proposals";

type Mode = "expand" | "repo";

export function AssistPanel({
  orgId,
  data,
  initialAnchorId,
  onClose,
  onApplied,
}: {
  orgId: string;
  data: GraphPayload;
  initialAnchorId?: string;
  onClose: () => void;
  onApplied: (summary: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("expand");
  const [anchorId, setAnchorId] = useState<string>(
    initialAnchorId ?? data.nodes[0]?.id ?? "",
  );
  const [repoText, setRepoText] = useState("");
  const [proposals, setProposals] = useState<ProposalSet | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const [applying, startApply] = useTransition();

  const relByKey = useMemo(
    () => new Map(data.relationshipTypes.map((r) => [r.key, r])),
    [data.relationshipTypes],
  );
  const anchorNode = data.nodes.find((n) => n.id === anchorId);

  const products = useMemo(
    () =>
      data.nodes.filter(
        (n) => /product/i.test(n.typeKey) || /product|app|project/i.test(n.typeName),
      ),
    [data.nodes],
  );

  function generate() {
    setError(null);
    setProposals(null);
    startGenerate(async () => {
      const res = await proposeGraphFill(orgId, {
        kind: mode,
        anchorId,
        repoText: mode === "repo" ? repoText : undefined,
      });
      if (res.error) return setError(res.error);
      const p = res.proposals!;
      setProposals(p);
      const n: Record<string, string> = {};
      const a: Record<string, boolean> = {};
      for (const node of p.nodes) {
        n[node.tempId] = node.displayName;
        a[node.tempId] = node.displayName.trim().length > 0;
      }
      setNames(n);
      setAccepted(a);
      if (p.nodes.length === 0) {
        setError(
          mode === "repo"
            ? "Nothing extracted. Paste a package.json or a list of file paths."
            : "No typical connections found for this node type.",
        );
      }
    });
  }

  function edgeForNode(tempId: string) {
    return proposals?.edges.find(
      (e) => e.sourceRef === `new:${tempId}` || e.targetRef === `new:${tempId}`,
    );
  }

  function relLabel(tempId: string): string {
    const e = edgeForNode(tempId);
    if (!e || !anchorNode) return "";
    const rel = relByKey.get(e.relationshipTypeKey);
    if (!rel) return "";
    const newIsSource = e.sourceRef === `new:${tempId}`;
    return `${newIsSource ? rel.forwardLabel : rel.reverseLabel} ${anchorNode.name}`;
  }

  function apply() {
    if (!proposals) return;
    setError(null);
    const acceptedTemps = new Set(
      proposals.nodes
        .filter((n) => accepted[n.tempId] && (names[n.tempId] ?? "").trim())
        .map((n) => n.tempId),
    );
    const nodes: AcceptedNode[] = proposals.nodes
      .filter((n) => acceptedTemps.has(n.tempId))
      .map((n) => ({
        tempId: n.tempId,
        recordTypeKey: n.recordTypeKey,
        displayName: (names[n.tempId] ?? "").trim(),
        values: n.values,
      }));
    const okRef = (ref: string) =>
      ref.startsWith("existing:") || acceptedTemps.has(ref.slice("new:".length));
    const edges: AcceptedEdge[] = proposals.edges.filter(
      (e) => okRef(e.sourceRef) && okRef(e.targetRef),
    );
    if (nodes.length === 0) {
      setError("Select at least one record (and give it a name).");
      return;
    }
    startApply(async () => {
      const res = await applyProposals(orgId, { nodes, edges });
      if (res.error) return setError(res.error);
      onApplied(
        `Added ${res.created ?? 0} new, reused ${res.reused ?? 0}, ${res.edges ?? 0} links`,
      );
    });
  }

  const typeName = useMemo(
    () => new Map(data.types.map((t) => [t.key, t.name])),
    [data.types],
  );

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card sm:w-[26rem]">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            AI fill
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">
            Grow the graph
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close AI fill"
          className="rounded-md px-1.5 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Mode switch */}
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(["expand", "repo"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setProposals(null);
                setError(null);
              }}
              className={
                "rounded px-2 py-1.5 text-xs font-medium transition " +
                (mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {m === "expand" ? "Expand a node" : "From repo"}
            </button>
          ))}
        </div>

        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {mode === "expand" ? "Build from" : "Product"}
          </span>
          <select
            value={anchorId}
            onChange={(e) => setAnchorId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {(mode === "repo" && products.length > 0 ? products : data.nodes).map(
              (n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · {n.typeName}
                </option>
              ),
            )}
          </select>
        </label>

        {mode === "repo" ? (
          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              package.json or file paths
            </span>
            <textarea
              value={repoText}
              onChange={(e) => setRepoText(e.target.value)}
              rows={6}
              placeholder={`Paste package.json, or a list of paths like\nsrc/app/billing/page.tsx\nsrc/features/checkout/...`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>
        ) : null}

        <button
          onClick={generate}
          disabled={generating || !anchorId}
          className="w-full rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {generating ? "Thinking…" : "Suggest connections"}
        </button>

        {/* Proposals */}
        {proposals && proposals.nodes.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Review ({proposals.nodes.filter((n) => accepted[n.tempId]).length}/
                {proposals.nodes.length})
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {proposals.source === "openai" ? "AI" : "scaffold"}
              </span>
            </div>
            <ul className="space-y-2">
              {proposals.nodes.map((n) => (
                <li
                  key={n.tempId}
                  className={
                    "rounded-md border p-2.5 transition " +
                    (accepted[n.tempId]
                      ? "border-primary/50 bg-primary/[0.03]"
                      : "border-border/70 opacity-70")
                  }
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(accepted[n.tempId])}
                      onChange={(e) =>
                        setAccepted((p) => ({ ...p, [n.tempId]: e.target.checked }))
                      }
                      className="mt-1.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        value={names[n.tempId] ?? ""}
                        onChange={(e) =>
                          setNames((p) => ({ ...p, [n.tempId]: e.target.value }))
                        }
                        placeholder={`Name this ${typeName.get(n.recordTypeKey) ?? "record"}…`}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:border-accent"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono uppercase tracking-[0.1em]">
                          {typeName.get(n.recordTypeKey) ?? n.recordTypeKey}
                        </span>{" "}
                        · {relLabel(n.tempId)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Applied records land as{" "}
          <span className="font-medium text-foreground">unreviewed</span> and
          reuse any existing node with a matching name — nothing duplicates.
        </p>
      </div>

      {proposals && proposals.nodes.length > 0 ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {applying ? "Adding…" : "Add selected"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
