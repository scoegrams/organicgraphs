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

export type PreviewGraphNode = {
  id: string;
  name: string;
  typeKey: string;
  typeName: string;
  color: string;
  status?: string | null;
  fields?: { label: string; value: string }[];
};

export type PreviewGraphEdge = {
  id: string;
  source: string;
  target: string;
  forwardLabel?: string;
  reverseLabel?: string;
};

type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
};

type Transform = { k: number; x: number; y: number };

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

export function PreviewGraph({
  nodes,
  edges,
  ink,
  paper,
  accent,
  height = 420,
}: {
  nodes: PreviewGraphNode[];
  edges: PreviewGraphEdge[];
  ink: string;
  paper: string;
  accent: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 860, h: height });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [, setFrame] = useState(0);
  // Selected locks the word chain; hover only previews when nothing is locked.
  const focusId = selectedId ?? hoverId;

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const n of nodes) d.set(n.id, 0);
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [nodes, edges]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) map.set(n.id, new Set());
    for (const e of edges) {
      map.get(e.source)?.add(e.target);
      map.get(e.target)?.add(e.source);
    }
    return map;
  }, [nodes, edges]);

  const selectedConnections = useMemo(() => {
    if (!selectedId) return [];
    const out: { id: string; name: string; typeName: string; label: string }[] = [];
    for (const e of edges) {
      if (e.source === selectedId) {
        const other = nodeById.get(e.target);
        if (other)
          out.push({
            id: other.id,
            name: other.name,
            typeName: other.typeName,
            label: e.forwardLabel ?? "linked to",
          });
      } else if (e.target === selectedId) {
        const other = nodeById.get(e.source);
        if (other)
          out.push({
            id: other.id,
            name: other.name,
            typeName: other.typeName,
            label: e.reverseLabel ?? "linked from",
          });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedId, edges, nodeById]);

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  const simRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{
    id: string | null;
    panning: boolean;
    px: number;
    py: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({
    id: null,
    panning: false,
    px: 0,
    py: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: Math.max(280, box.width), h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    const sim = new Map<string, SimNode>();
    const n = nodes.length;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.36;
    const golden = Math.PI * (3 - Math.sqrt(5));
    nodes.forEach((node, i) => {
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
        r: 4.5 + Math.sqrt(deg) * 2.4,
        color: node.color || ink,
      });
    });
    simRef.current = sim;
    alphaRef.current = 1;
  }, [nodes, edges, size.w, size.h, degree, ink]);

  const tick = useCallback(() => {
    const sim = simRef.current;
    const list = Array.from(sim.values());
    const alpha = alphaRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;

    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          dist2 = dx * dx + dy * dy + 0.01;
        }
        const dist = Math.sqrt(dist2);
        const force = (4200 / dist2) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
        const minSep = a.r + b.r + 10;
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

    for (const e of edges) {
      const a = sim.get(e.source);
      const b = sim.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - 78) * 0.018 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of list) {
      if (draggingRef.current.id === node.id) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += (cx - node.x) * 0.004 * alpha;
      node.vy += (cy - node.y) * 0.004 * alpha;
      node.vx *= 0.84;
      node.vy *= 0.84;
      node.x += node.vx;
      node.y += node.vy;
    }

    alphaRef.current = Math.max(0, alpha * 0.985);
    setFrame((f) => (f + 1) % 1_000_000);
  }, [edges, size.w, size.h]);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const loop = () => {
      tick();
      if (alphaRef.current > 0.004 || draggingRef.current.id) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, nodes.length]);

  // Soft auto-fit once after settle.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const list = Array.from(simRef.current.values());
      if (list.length === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of list) {
        minX = Math.min(minX, n.x - n.r);
        maxX = Math.max(maxX, n.x + n.r);
        minY = Math.min(minY, n.y - n.r);
        maxY = Math.max(maxY, n.y + n.r);
      }
      const cw = Math.max(1, maxX - minX);
      const ch = Math.max(1, maxY - minY);
      const pad = 48;
      const k = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min((size.w - pad * 2) / cw, (size.h - pad * 2) / ch)),
      );
      setTransform({
        k,
        x: (size.w - cw * k) / 2 - minX * k,
        y: (size.h - ch * k) / 2 - minY * k,
      });
    }, 900);
    return () => window.clearTimeout(id);
  }, [nodes.length, size.w, size.h]);

  const onBackgroundPointerDown = useCallback((e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = {
      id: null,
      panning: true,
      px: e.clientX,
      py: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }, []);

  const onNodePointerDown = useCallback((e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = {
      id,
      panning: false,
      px: e.clientX,
      py: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    alphaRef.current = Math.max(alphaRef.current, 0.12);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const drag = draggingRef.current;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (dist > 5) drag.moved = true;

    if (drag.id) {
      // Only drag the node after a real move — keeps clicks clean.
      if (!drag.moved) return;
      const node = simRef.current.get(drag.id);
      if (node) {
        const k = transformRef.current.k;
        node.x += (e.clientX - drag.px) / k;
        node.y += (e.clientY - drag.py) / k;
        drag.px = e.clientX;
        drag.py = e.clientY;
        setFrame((f) => (f + 1) % 1_000_000);
      }
    } else if (drag.panning) {
      if (!drag.moved) return;
      const dx = e.clientX - drag.px;
      const dy = e.clientY - drag.py;
      drag.px = e.clientX;
      drag.py = e.clientY;
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }
  }, []);

  const endPointer = useCallback(() => {
    const drag = draggingRef.current;
    if (!drag.moved) {
      if (drag.id) {
        // Click node: lock it, or unlock if already selected.
        setSelectedId((prev) => (prev === drag.id ? null : drag.id));
      } else if (drag.panning) {
        // Click empty canvas: unlock.
        setSelectedId(null);
      }
    }
    draggingRef.current = {
      id: null,
      panning: false,
      px: 0,
      py: 0,
      startX: 0,
      startY: 0,
      moved: false,
    };
  }, []);

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
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
  }, []);

  const neighborIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const n of adjacency.get(focusId) ?? []) set.add(n);
    return set;
  }, [focusId, adjacency]);

  const sim = simRef.current;
  const focusNode = focusId ? nodeById.get(focusId) : null;

  // Word chain: focused node first, then neighbors left→right by live graph x.
  let wordChain: {
    id: string;
    name: string;
    typeName: string;
    color: string;
    lead: boolean;
  }[] = [];
  if (focusId && focusNode) {
    const neighborList = [...(adjacency.get(focusId) ?? [])]
      .map((id) => {
        const n = nodeById.get(id);
        const s = sim.get(id);
        if (!n || !s) return null;
        return { id, name: n.name, typeName: n.typeName, color: n.color, x: s.x };
      })
      .filter(Boolean) as {
        id: string;
        name: string;
        typeName: string;
        color: string;
        x: number;
      }[];
    neighborList.sort((a, b) => a.x - b.x);
    wordChain = [
      {
        id: focusNode.id,
        name: focusNode.name,
        typeName: focusNode.typeName,
        color: accent,
        lead: true,
      },
      ...neighborList.map((n) => ({
        id: n.id,
        name: n.name,
        typeName: n.typeName,
        color: n.color,
        lead: false,
      })),
    ];
  }

  if (nodes.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${ink}22`,
          borderRadius: 12,
          background: paper,
          color: ink,
          opacity: 0.5,
          fontSize: 14,
        }}
      >
        No records to draft yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        height,
        width: "100%",
      }}
    >
      <style>{`
        @keyframes og-word-pop {
          from { opacity: 0; transform: translateY(14px) scale(0.92); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .og-word-chip {
          animation: og-word-pop 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
          white-space: nowrap;
        }
      `}</style>

      {/* Graph plate */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          height: "100%",
          borderRadius: 12,
          border: `1px solid ${ink}18`,
          background: paper,
          overflow: "hidden",
        }}
      >
      {/* Word chain — pops above the draft */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 5,
          pointerEvents: "none",
          padding: "16px 18px 10px",
          minHeight: 72,
          background: `linear-gradient(180deg, ${paper}f5 0%, ${paper}00 100%)`,
          display: "flex",
          alignItems: "flex-end",
          overflowX: "auto",
        }}
      >
        {wordChain.length > 0 ? (
          <div
            key={focusId ?? "idle"}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 0,
              flexWrap: "nowrap",
            }}
          >
            {wordChain.map((w, i) => (
              <div
                key={w.id}
                className="og-word-chip"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  animationDelay: `${i * 70}ms`,
                }}
              >
                {i > 0 ? (
                  <span
                    style={{
                      margin: "0 10px",
                      color: ink,
                      opacity: 0.28,
                      fontSize: 18,
                      fontWeight: 300,
                    }}
                  >
                    →
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedId((prev) => (prev === w.id ? null : w.id))
                  }
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: w.lead ? accent : ink,
                      opacity: w.lead ? 0.75 : 0.4,
                      marginBottom: 2,
                    }}
                  >
                    {w.typeName}
                  </span>
                  <span
                    style={{
                      fontSize: w.lead ? "clamp(1.35rem, 3.2vw, 1.85rem)" : "clamp(1rem, 2.2vw, 1.25rem)",
                      fontWeight: w.lead ? 800 : 600,
                      letterSpacing: w.lead ? "-0.03em" : "-0.02em",
                      color: w.lead ? accent : ink,
                      lineHeight: 1.05,
                      borderBottom: w.lead ? `2px solid ${accent}` : `1px solid ${w.color}88`,
                      paddingBottom: 2,
                    }}
                  >
                    {w.name}
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: ink,
              opacity: 0.35,
            }}
          >
            Hover to preview · click to lock · click again to unlock
          </p>
        )}
        {selectedId ? (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: accent,
              opacity: 0.8,
              paddingLeft: 12,
              flexShrink: 0,
            }}
          >
            Locked
          </span>
        ) : null}
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          display: "block",
          cursor: draggingRef.current.panning ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {edges.map((e) => {
            const a = sim.get(e.source);
            const b = sim.get(e.target);
            if (!a || !b) return null;
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
                stroke={active ? accent : ink}
                strokeWidth={(active ? 1.6 : 1) / transform.k}
                strokeOpacity={dim ? 0.06 : active ? 0.85 : 0.22}
              />
            );
          })}

          {nodes.map((n) => {
            const s = sim.get(n.id);
            if (!s) return null;
            const inFocus = !neighborIds || neighborIds.has(n.id);
            const dim = !!neighborIds && !inFocus;
            const hot = n.id === focusId;
            const locked = n.id === selectedId;
            return (
              <g
                key={n.id}
                transform={`translate(${s.x} ${s.y})`}
                opacity={dim ? 0.18 : 1}
                style={{ cursor: "pointer" }}
                onPointerDown={(ev) => onNodePointerDown(ev, n.id)}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId(null)}
              >
                {hot ? (
                  <circle
                    r={s.r + (locked ? 6 : 4) / transform.k}
                    fill="none"
                    stroke={accent}
                    strokeWidth={(locked ? 2 : 1.5) / transform.k}
                  />
                ) : null}
                <circle
                  r={s.r}
                  fill={hot ? accent : s.color}
                />
              </g>
            );
          })}
        </g>
      </svg>
      </div>

      {/* Details — sits just outside the graph on the right */}
      {selectedNode ? (
        <aside
          style={{
            width: 200,
            flexShrink: 0,
            height: "100%",
            borderRadius: 12,
            border: `1px solid ${ink}18`,
            background: paper,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "og-word-pop 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <div
            style={{
              padding: "12px 12px 10px",
              borderBottom: `1px solid ${ink}14`,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: accent,
                }}
              >
                {selectedNode.typeName}
              </p>
              <h3
                style={{
                  margin: "3px 0 0",
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: ink,
                  lineHeight: 1.15,
                }}
              >
                {selectedNode.name}
              </h3>
              {selectedNode.status ? (
                <p
                  style={{
                    margin: "6px 0 0",
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: `${accent}22`,
                    color: accent,
                  }}
                >
                  {selectedNode.status}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close details"
              style={{
                border: `1px solid ${ink}22`,
                background: "transparent",
                color: ink,
                borderRadius: 6,
                width: 24,
                height: 24,
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 12px 14px",
            }}
          >
            {selectedNode.fields && selectedNode.fields.length > 0 ? (
              <section style={{ marginBottom: 14 }}>
                <h4
                  style={{
                    margin: "0 0 8px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: ink,
                    opacity: 0.45,
                  }}
                >
                  Details
                </h4>
                <dl style={{ margin: 0 }}>
                  {selectedNode.fields.map((f) => (
                    <div
                      key={f.label}
                      style={{
                        marginBottom: 8,
                        fontSize: 12,
                      }}
                    >
                      <dt
                        style={{
                          color: ink,
                          opacity: 0.45,
                          margin: "0 0 2px",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {f.label}
                      </dt>
                      <dd
                        style={{
                          margin: 0,
                          color: ink,
                          fontWeight: 600,
                          wordBreak: "break-word",
                        }}
                      >
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <section>
              <h4
                style={{
                  margin: "0 0 8px",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: ink,
                  opacity: 0.45,
                }}
              >
                Links ({selectedConnections.length})
              </h4>
              {selectedConnections.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, opacity: 0.5, color: ink }}>
                  No links in draft.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {selectedConnections.map((c) => (
                    <li key={c.id + c.label} style={{ marginBottom: 5 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: `1px solid ${ink}14`,
                          background: `${ink}06`,
                          borderRadius: 6,
                          padding: "6px 8px",
                          cursor: "pointer",
                          color: ink,
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            opacity: 0.45,
                            marginBottom: 1,
                          }}
                        >
                          {c.label}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          {c.name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
