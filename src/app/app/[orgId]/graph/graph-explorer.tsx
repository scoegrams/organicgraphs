"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { RecordBuilder, type BuilderAnchor } from "./builder";
import { AssistPanel } from "./assist";
import { MergeDupesPanel } from "./merge-dupes";
import { fuzzySearchRecords, deleteRelationship } from "./actions";

export interface GraphPayload {
  orgName: string;
  types: {
    key: string;
    name: string;
    fields: {
      key: string;
      name: string;
      type: string;
      required?: boolean;
      options?: string[];
    }[];
  }[];
  relationshipTypes: {
    key: string;
    sourceTypeKey: string;
    targetTypeKey: string;
    forwardLabel: string;
    reverseLabel: string;
  }[];
  nodes: {
    id: string;
    name: string;
    typeKey: string;
    typeName: string;
    status: string | null;
    fields: { label: string; value: string }[];
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    forwardLabel: string;
    reverseLabel: string;
  }[];
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  typeKey: string;
  fixed: boolean;
}

interface Transform {
  k: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const LABEL_FONT = 11.5;

export function GraphExplorer({
  data,
  orgId,
}: {
  data: GraphPayload;
  orgId: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 620 });

  const [building, setBuilding] = useState(false);
  const [builderAnchor, setBuilderAnchor] = useState<BuilderAnchor | undefined>(
    undefined,
  );
  const [assisting, setAssisting] = useState(false);
  const [assistAnchorId, setAssistAnchorId] = useState<string | undefined>(
    undefined,
  );
  const [mergingDupes, setMergingDupes] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fuzzyIds, setFuzzyIds] = useState<Set<string> | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [, setFrame] = useState(0);

  // ---- Derived lookups -----------------------------------------------------
  const nodeById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  );

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const n of data.nodes) d.set(n.id, 0);
    for (const e of data.edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [data.nodes, data.edges]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of data.nodes) map.set(n.id, new Set());
    for (const e of data.edges) {
      map.get(e.source)?.add(e.target);
      map.get(e.target)?.add(e.source);
    }
    return map;
  }, [data.nodes, data.edges]);

  const typeCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of data.nodes) c.set(n.typeKey, (c.get(n.typeKey) ?? 0) + 1);
    return c;
  }, [data.nodes]);

  // Instant client substring match, upgraded by Postgres pg_trgm when ready.
  const clientMatchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      data.nodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.typeName.toLowerCase().includes(q),
        )
        .map((n) => n.id),
    );
  }, [query, data.nodes]);

  const matchIds = useMemo(() => {
    if (!query.trim()) return null;
    if (!fuzzyIds) return clientMatchIds;
    const merged = new Set(fuzzyIds);
    if (clientMatchIds) for (const id of clientMatchIds) merged.add(id);
    return merged;
  }, [query, fuzzyIds, clientMatchIds]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFuzzyIds(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void fuzzySearchRecords(orgId, q).then((res) => {
        if (cancelled) return;
        if (res.hits) setFuzzyIds(new Set(res.hits.map((h) => h.id)));
        else setFuzzyIds(null);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, orgId]);

  // ---- Simulation state (mutable refs) -------------------------------------
  const simRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const tweenRef = useRef<number | null>(null);
  const draggingRef = useRef<{
    id: string | null;
    panning: boolean;
    px: number;
    py: number;
  }>({ id: null, panning: false, px: 0, py: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    const sim = new Map<string, SimNode>();
    const n = data.nodes.length;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.4;
    const golden = Math.PI * (3 - Math.sqrt(5));
    data.nodes.forEach((node, i) => {
      const prev = simRef.current.get(node.id);
      const t = n <= 1 ? 0 : i / (n - 1);
      const rr = radius * Math.sqrt(t + 0.05);
      const angle = i * golden;
      const deg = degree.get(node.id) ?? 0;
      sim.set(node.id, {
        id: node.id,
        x: prev?.x ?? cx + rr * Math.cos(angle),
        y: prev?.y ?? cy + rr * Math.sin(angle),
        vx: 0,
        vy: 0,
        r: 5 + Math.sqrt(deg) * 3,
        typeKey: node.typeKey,
        fixed: false,
      });
    });
    simRef.current = sim;
    alphaRef.current = 1;
    startSim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.nodes, data.edges, size.w, size.h]);

  const tick = useCallback(() => {
    const sim = simRef.current;
    const nodes = Array.from(sim.values());
    const alpha = alphaRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;

    // Per-type centroids for cluster attraction (structure by record type).
    const cent = new Map<string, { x: number; y: number; n: number }>();
    for (const node of nodes) {
      const c = cent.get(node.typeKey) ?? { x: 0, y: 0, n: 0 };
      c.x += node.x;
      c.y += node.y;
      c.n += 1;
      cent.set(node.typeKey, c);
    }
    for (const c of cent.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }

    // Repulsion + hard collision (O(n^2), fine for org-scale graphs).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          dist2 = dx * dx + dy * dy + 0.01;
        }
        const dist = Math.sqrt(dist2);
        const force = (6500 / dist2) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
        // Collision: push apart so circles never stack.
        const minSep = a.r + b.r + 12;
        if (dist < minSep) {
          const push = (minSep - dist) * 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x += ux * push;
          a.y += uy * push;
          b.x -= ux * push;
          b.y -= uy * push;
        }
      }
    }

    // Springs along edges.
    const targetLen = 90;
    for (const e of data.edges) {
      const a = sim.get(e.source);
      const b = sim.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - targetLen) * 0.02 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      // Weak global gravity + cluster pull toward this node's type centroid.
      node.vx += (cx - node.x) * 0.003 * alpha;
      node.vy += (cy - node.y) * 0.003 * alpha;
      const c = cent.get(node.typeKey);
      if (c) {
        node.vx += (c.x - node.x) * 0.045 * alpha;
        node.vy += (c.y - node.y) * 0.045 * alpha;
      }
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
    }

    alphaRef.current = Math.max(0, alpha * 0.985);
    setFrame((f) => (f + 1) % 1_000_000);
  }, [data.edges, size.w, size.h]);

  const startSim = useCallback(() => {
    if (rafRef.current != null) return;
    const loop = () => {
      tick();
      if (alphaRef.current > 0.004 || draggingRef.current.id) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [tick]);

  const reheat = useCallback(
    (a = 0.35) => {
      alphaRef.current = Math.max(alphaRef.current, a);
      startSim();
    },
    [startSim],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    };
  }, []);

  // ---- Camera --------------------------------------------------------------
  const cancelTween = useCallback(() => {
    if (tweenRef.current != null) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
  }, []);

  const animateTo = useCallback(
    (target: Transform, dur = 480) => {
      cancelTween();
      const start = { ...transformRef.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setTransform({
          k: start.k + (target.k - start.k) * e,
          x: start.x + (target.x - start.x) * e,
          y: start.y + (target.y - start.y) * e,
        });
        if (p < 1) tweenRef.current = requestAnimationFrame(step);
        else tweenRef.current = null;
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [cancelTween],
  );

  const fitTransform = useCallback(
    (ids: string[] | null, pad = 64, maxK = MAX_ZOOM): Transform => {
      const { w, h } = sizeRef.current;
      const nodes = (
        ids ? ids.map((id) => simRef.current.get(id)) : Array.from(simRef.current.values())
      ).filter(Boolean) as SimNode[];
      if (nodes.length === 0) return { k: 1, x: 0, y: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x - n.r);
        maxX = Math.max(maxX, n.x + n.r);
        minY = Math.min(minY, n.y - n.r);
        maxY = Math.max(maxY, n.y + n.r);
      }
      const cw = Math.max(1, maxX - minX);
      const ch = Math.max(1, maxY - minY);
      const k = Math.min(
        maxK,
        Math.max(MIN_ZOOM, Math.min((w - pad * 2) / cw, (h - pad * 2) / ch)),
      );
      return {
        k,
        x: (w - cw * k) / 2 - minX * k,
        y: (h - ch * k) / 2 - minY * k,
      };
    },
    [],
  );

  const focusNode = useCallback(
    (id: string) => {
      const ids = new Set<string>([id]);
      for (const n of adjacency.get(id) ?? []) {
        ids.add(n);
        for (const n2 of adjacency.get(n) ?? []) ids.add(n2);
      }
      animateTo(fitTransform(Array.from(ids), 90, 1.8));
    },
    [adjacency, animateTo, fitTransform],
  );

  const resetView = useCallback(() => {
    reheat(0.4);
    animateTo(fitTransform(null));
  }, [reheat, animateTo, fitTransform]);

  // Auto-frame once the initial layout has settled.
  useEffect(() => {
    const id = setTimeout(() => animateTo(fitTransform(null), 600), 1600);
    return () => clearTimeout(id);
  }, [data.nodes.length, animateTo, fitTransform]);

  // Fly to search matches.
  useEffect(() => {
    if (!matchIds || matchIds.size === 0) return;
    const id = setTimeout(
      () => animateTo(fitTransform(Array.from(matchIds), 110, 2.2)),
      250,
    );
    return () => clearTimeout(id);
  }, [matchIds, animateTo, fitTransform]);

  // ---- Resize --------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box)
        setSize({ w: Math.max(320, box.width), h: Math.max(420, box.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Pointer interactions ------------------------------------------------
  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      e.stopPropagation();
      cancelTween();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      draggingRef.current = { id, panning: false, px: e.clientX, py: e.clientY };
      const node = simRef.current.get(id);
      if (node) node.fixed = true;
      reheat(0.1);
    },
    [reheat, cancelTween],
  );

  const onBackgroundPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      cancelTween();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      draggingRef.current = {
        id: null,
        panning: true,
        px: e.clientX,
        py: e.clientY,
      };
    },
    [cancelTween],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const drag = draggingRef.current;
    if (drag.id) {
      const node = simRef.current.get(drag.id);
      if (node) {
        const k = transformRef.current.k;
        node.x += (e.clientX - drag.px) / k;
        node.y += (e.clientY - drag.py) / k;
        node.vx = 0;
        node.vy = 0;
        drag.px = e.clientX;
        drag.py = e.clientY;
        setFrame((f) => (f + 1) % 1_000_000);
      }
    } else if (drag.panning) {
      const dx = e.clientX - drag.px;
      const dy = e.clientY - drag.py;
      drag.px = e.clientX;
      drag.py = e.clientY;
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }
  }, []);

  const endPointer = useCallback(() => {
    const drag = draggingRef.current;
    if (drag.id) {
      const node = simRef.current.get(drag.id);
      if (node) node.fixed = false;
      reheat(0.15);
    }
    draggingRef.current = { id: null, panning: false, px: 0, py: 0 };
  }, [reheat]);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      e.preventDefault();
      cancelTween();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setTransform((t) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
        const ratio = k / t.k;
        return { k, x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio };
      });
    },
    [cancelTween],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      cancelTween();
      setTransform((t) => {
        const cx = sizeRef.current.w / 2;
        const cy = sizeRef.current.h / 2;
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
        const ratio = k / t.k;
        return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
      });
    },
    [cancelTween],
  );

  const [spineMode, setSpineMode] = useState(false);

  const toggleType = useCallback((key: string) => {
    setSpineMode(false);
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // The delivery spine: Client → Project → Feature.
  const spineTypeKeys = useMemo(
    () =>
      data.types
        .map((t) => t.key)
        .filter((k) => k === "customer" || k === "product" || k === "feature"),
    [data.types],
  );
  const hasSpine = spineTypeKeys.length > 0;

  const toggleSpine = useCallback(() => {
    setSpineMode((prev) => {
      const nextOn = !prev;
      if (nextOn) {
        const spine = new Set<string>(spineTypeKeys);
        setHiddenTypes(
          new Set(data.types.map((t) => t.key).filter((k) => !spine.has(k))),
        );
        const ids = data.nodes
          .filter((n) => spine.has(n.typeKey))
          .map((n) => n.id);
        animateTo(fitTransform(ids, 90));
      } else {
        setHiddenTypes(new Set());
        animateTo(fitTransform(null));
      }
      return nextOn;
    });
  }, [spineTypeKeys, data.types, data.nodes, animateTo, fitTransform]);

  // ---- Focus / selection ---------------------------------------------------
  const focusId = hoverId ?? selectedId;

  // 1-hop only: show the node and its direct connections.
  // In a small dense graph, 2 hops covers nearly everything.
  const neighborIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const n of adjacency.get(focusId) ?? []) set.add(n);
    return set;
  }, [focusId, adjacency]);

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;
  const selectedConnections = useMemo(() => {
    if (!selectedId) return [];
    const out: { edgeId: string; id: string; name: string; typeName: string; label: string }[] = [];
    for (const e of data.edges) {
      if (e.source === selectedId) {
        const other = nodeById.get(e.target);
        if (other)
          out.push({
            edgeId: e.id,
            id: other.id,
            name: other.name,
            typeName: other.typeName,
            label: e.forwardLabel,
          });
      } else if (e.target === selectedId) {
        const other = nodeById.get(e.source);
        if (other)
          out.push({
            edgeId: e.id,
            id: other.id,
            name: other.name,
            typeName: other.typeName,
            label: e.reverseLabel,
          });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedId, data.edges, nodeById]);

  const isHidden = useCallback(
    (typeKey: string) => hiddenTypes.has(typeKey),
    [hiddenTypes],
  );

  const sim = simRef.current;

  // ---- Label layout: importance-ranked, collision-free, zoom-aware ---------
  // Recomputed every render (i.e. every simulation frame via setFrame) so
  // labels track live node positions during settling, drag, pan, and zoom.
  const labels = ((): {
    id: string;
    sx: number;
    sy: number;
    name: string;
    strong: boolean;
  }[] => {
    const { w, h } = size;
    const t = transform;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const out: {
      id: string;
      sx: number;
      sy: number;
      name: string;
      strong: boolean;
    }[] = [];

    const candidates = data.nodes
      .filter((n) => !isHidden(n.typeKey))
      .filter((n) => !neighborIds || neighborIds.has(n.id))
      .map((n) => {
        const forced =
          n.id === selectedId ||
          n.id === hoverId ||
          (!!matchIds && matchIds.has(n.id)) ||
          (!!neighborIds && neighborIds.has(n.id));
        return { n, deg: degree.get(n.id) ?? 0, forced };
      })
      .sort((a, b) => {
        if (a.forced !== b.forced) return a.forced ? -1 : 1;
        return b.deg - a.deg;
      });

    const overlaps = (b: { x: number; y: number; w: number; h: number }) => {
      for (const p of placed) {
        if (
          b.x < p.x + p.w + 3 &&
          b.x + b.w + 3 > p.x &&
          b.y < p.y + p.h + 2 &&
          b.y + b.h + 2 > p.y
        )
          return true;
      }
      return false;
    };

    for (const { n, forced } of candidates) {
      const s = sim.get(n.id);
      if (!s) continue;
      const sx = s.x * t.k + t.x;
      const sy = s.y * t.k + t.y;
      const rScreen = s.r * t.k;
      if (!forced && (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30))
        continue;
      const text = n.name.length > 26 ? n.name.slice(0, 25) + "…" : n.name;
      const bw = Math.min(180, text.length * 6.3) + 8;
      const bh = 16;
      const box = { x: sx - bw / 2, y: sy + rScreen + 4, w: bw, h: bh };
      if (!forced && overlaps(box)) continue;
      placed.push(box);
      out.push({ id: n.id, sx, sy: box.y + 12, name: text, strong: forced });
    }
    return out;
  })();

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fuzzy search…"
            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {matchIds ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-accent">
              {matchIds.size}
            </span>
          ) : null}
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {data.nodes.length} records · {data.edges.length} links
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              setBuilding(false);
              setAssisting(false);
              setMergingDupes(true);
            }}
            className="mr-1 h-8 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
            title="Find and merge near-duplicate names (pg_trgm)"
          >
            Merge dupes
          </button>
          <button
            onClick={() => {
              setBuilding(false);
              setMergingDupes(false);
              setAssistAnchorId(selectedId ?? undefined);
              setAssisting(true);
            }}
            className="mr-1 h-8 rounded-md border border-accent px-2.5 text-xs font-medium text-accent transition hover:bg-accent/10"
          >
            ✦ AI fill
          </button>
          <button
            onClick={() => {
              setSelectedId(null);
              setBuilderAnchor(undefined);
              setBuilding(true);
            }}
            className="mr-1 h-8 rounded-md border border-primary bg-primary px-2.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            + New record
          </button>
          {hasSpine ? (
            <button
              onClick={toggleSpine}
              aria-pressed={spineMode}
              title="Show only Client → Project → Feature"
              className={cn(
                "mr-1 h-8 rounded-md border px-2.5 font-mono text-xs uppercase tracking-[0.12em] transition",
                spineMode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              Spine
            </button>
          ) : null}
          <ZoomButton onClick={() => zoomBy(1.25)} label="Zoom in">
            +
          </ZoomButton>
          <ZoomButton onClick={() => zoomBy(0.8)} label="Zoom out">
            −
          </ZoomButton>
          <button
            onClick={resetView}
            className="h-8 rounded-md border border-input px-2.5 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground transition hover:border-foreground hover:text-foreground"
          >
            Fit
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative h-[64vh] min-h-[440px] w-full">
        {data.nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <svg
            ref={svgRef}
            className="h-full w-full touch-none select-none"
            style={{ cursor: draggingRef.current.panning ? "grabbing" : "grab" }}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerLeave={endPointer}
            onWheel={onWheel}
            onClick={() => setSelectedId(null)}
          >
            <g
              transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
            >
              {/* Edges */}
              {data.edges.map((e) => {
                const a = sim.get(e.source);
                const b = sim.get(e.target);
                if (!a || !b) return null;
                const sn = nodeById.get(e.source);
                const tn = nodeById.get(e.target);
                if ((sn && isHidden(sn.typeKey)) || (tn && isHidden(tn.typeKey)))
                  return null;
                const active =
                  !!neighborIds &&
                  neighborIds.has(e.source) &&
                  neighborIds.has(e.target);
                const dim = !!neighborIds && !active;
                return (
                  <line
                    key={e.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={active ? "stroke-primary" : "stroke-foreground"}
                    strokeWidth={(active ? 1.5 : 1) / transform.k}
                    strokeOpacity={dim ? 0.05 : active ? 0.9 : 0.2}
                  />
                );
              })}

              {/* Nodes */}
              {data.nodes.map((n) => {
                if (isHidden(n.typeKey)) return null;
                const s = sim.get(n.id);
                if (!s) return null;
                const isSelected = n.id === selectedId;
                const inFocus = !neighborIds || neighborIds.has(n.id);
                const isMatch = !!matchIds && matchIds.has(n.id);
                const dim = (!!neighborIds && !inFocus) || (!!matchIds && !isMatch);
                const emphasized = !!neighborIds && neighborIds.has(n.id);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${s.x} ${s.y})`}
                    className="cursor-pointer"
                    opacity={dim ? 0.2 : 1}
                    onPointerDown={(ev) => onNodePointerDown(ev, n.id)}
                    onPointerEnter={() => setHoverId(n.id)}
                    onPointerLeave={() => setHoverId(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedId(n.id);
                    }}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedId(n.id);
                      focusNode(n.id);
                    }}
                  >
                    {isMatch ? (
                      <circle
                        r={s.r + 4 / transform.k}
                        fill="none"
                        className="stroke-accent"
                        strokeWidth={1.5 / transform.k}
                      />
                    ) : null}
                    <circle
                      r={s.r}
                      className={
                        isSelected || emphasized ? "fill-primary" : "fill-foreground"
                      }
                      stroke={isSelected ? "hsl(var(--card))" : "transparent"}
                      strokeWidth={2 / transform.k}
                    />
                  </g>
                );
              })}
            </g>

            {/* Labels — screen space, collision-free, on paper chips */}
            {labels.map((l) => {
              const bw = Math.min(180, l.name.length * 6.3) + 8;
              return (
                <g key={l.id} className="pointer-events-none">
                  <rect
                    x={l.sx - bw / 2}
                    y={l.sy - 11}
                    width={bw}
                    height={15}
                    rx={2}
                    className="fill-card"
                    opacity={0.72}
                  />
                  <text
                    x={l.sx}
                    y={l.sy}
                    textAnchor="middle"
                    className={l.strong ? "fill-foreground" : "fill-muted-foreground"}
                    style={{
                      fontSize: `${LABEL_FONT}px`,
                      fontWeight: l.strong ? 600 : 400,
                    }}
                  >
                    {l.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Legend / type filters */}
        {data.types.length > 0 ? (
          <div className="absolute left-3 top-3 max-w-[42%] rounded-md border border-border bg-card/90 p-3 backdrop-blur-sm">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Record types
            </p>
            <div className="flex max-h-[42vh] flex-col gap-1 overflow-y-auto pr-1">
              {data.types
                .filter((t) => (typeCounts.get(t.key) ?? 0) > 0)
                .map((t) => {
                  const hidden = hiddenTypes.has(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleType(t.key)}
                      className={cn(
                        "flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition hover:bg-secondary",
                        hidden && "opacity-40",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          hidden ? "bg-muted-foreground" : "bg-foreground",
                        )}
                      />
                      <span className="truncate">{t.name}</span>
                      <span className="ml-auto pl-1 font-mono tabular-nums text-muted-foreground">
                        {typeCounts.get(t.key) ?? 0}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : null}

        {/* Hint */}
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          click to focus · double-click to zoom · scroll to zoom · drag to pan
        </p>

        {/* Merge near-duplicates */}
        {mergingDupes ? (
          <MergeDupesPanel
            orgId={orgId}
            onClose={() => setMergingDupes(false)}
            onMerged={(summary) => {
              setToast(summary);
              reheat(0.5);
              router.refresh();
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        ) : null}

        {/* AI fill */}
        {assisting ? (
          <AssistPanel
            orgId={orgId}
            data={data}
            initialAnchorId={assistAnchorId}
            onClose={() => setAssisting(false)}
            onApplied={(summary) => {
              setAssisting(false);
              setToast(summary);
              reheat(0.6);
              router.refresh();
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        ) : null}

        {/* Builder */}
        {building ? (
          <RecordBuilder
            orgId={orgId}
            data={data}
            anchor={builderAnchor}
            onClose={() => setBuilding(false)}
            onCreated={(id) => {
              setBuilding(false);
              setSelectedId(id);
              reheat(0.5);
              router.refresh();
            }}
          />
        ) : selectedNode ? (
          <Inspector
            node={selectedNode}
            connections={selectedConnections}
            orgId={orgId}
            onClose={() => setSelectedId(null)}
            onNavigate={(id) => setSelectedId(id)}
            onZoom={(id) => focusNode(id)}
            onUnlink={async (edgeId) => {
              const res = await deleteRelationship(orgId, edgeId);
              if (res.error) setToast(res.error);
            }}
            onExtend={() => {
              setBuilderAnchor({
                id: selectedNode.id,
                name: selectedNode.name,
                typeKey: selectedNode.typeKey,
                typeName: selectedNode.typeName,
              });
              setBuilding(true);
            }}
            onAssist={() => {
              setAssistAnchorId(selectedNode.id);
              setAssisting(true);
            }}
          />
        ) : null}

        {toast ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md border border-primary/50 bg-card px-4 py-2 text-sm shadow-sm">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ZoomButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-lg leading-none text-muted-foreground transition hover:border-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        No records to draw yet. Populate your graph from the wizard, or load a
        sample company from the workspace, and it will appear here.
      </p>
    </div>
  );
}

function Inspector({
  node,
  connections,
  orgId: _orgId,
  onClose,
  onNavigate,
  onZoom,
  onUnlink,
  onExtend,
  onAssist,
}: {
  node: GraphPayload["nodes"][number];
  connections: { edgeId: string; id: string; name: string; typeName: string; label: string }[];
  orgId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onZoom: (id: string) => void;
  onUnlink: (edgeId: string) => void;
  onExtend: () => void;
  onAssist: () => void;
}) {
  const groups = new Map<string, typeof connections>();
  for (const c of connections) {
    const arr = groups.get(c.label) ?? [];
    arr.push(c);
    groups.set(c.label, arr);
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-border bg-card sm:w-80">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {node.typeName}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold tracking-tight">
            {node.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onZoom(node.id)}
            aria-label="Zoom to node"
            className="rounded-md border border-input px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-foreground hover:text-foreground"
          >
            Zoom
          </button>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-md px-1.5 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {node.fields.length > 0 ? (
          <section>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Details
            </h3>
            <dl className="space-y-2">
              {node.fields.map((f) => (
                <div key={f.label} className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
                  <dt className="truncate text-muted-foreground">{f.label}</dt>
                  <dd className="break-words">{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Connections ({connections.length})
          </h3>
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections yet.</p>
          ) : (
            <div className="space-y-4">
              {Array.from(groups.entries()).map(([label, items]) => (
                <div key={label}>
                  <p className="mb-1 text-xs text-muted-foreground">{label}</p>
                  <ul className="space-y-1">
                    {items.map((c) => (
                      <li key={c.id + label} className="group flex items-center gap-1">
                        <button
                          onClick={() => onNavigate(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition hover:border-border hover:bg-secondary"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground transition group-hover:bg-primary" />
                          <span className="truncate">{c.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                            {c.typeName}
                          </span>
                        </button>
                        <button
                          onClick={() => onUnlink(c.edgeId)}
                          title="Remove this connection"
                          aria-label={`Unlink ${c.name}`}
                          className="shrink-0 rounded px-1 py-1 text-xs text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        <button
          onClick={onExtend}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          + Build from here
        </button>
        <button
          onClick={onAssist}
          className="w-full rounded-md border border-accent px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/10"
        >
          ✦ Suggest with AI
        </button>
        <p className="text-center text-[11px] text-muted-foreground">
          Add records already wired to {node.name}
        </p>
      </div>
    </aside>
  );
}
