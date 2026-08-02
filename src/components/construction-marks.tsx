/**
 * Drafting-sheet ornament: crosshair registration marks and the org-graph
 * node/edge glyph, drawn once here so every surface reuses the same marks
 * instead of inventing new decoration per page.
 */
import { cn } from "@/lib/utils";

export function CornerTicks({ className }: { className?: string }) {
  const tick = "absolute h-3 w-3";
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn(tick, "left-0 top-0")}>
        <span className="absolute left-0 top-1/2 h-px w-full bg-foreground/45" />
        <span className="absolute left-1/2 top-0 h-full w-px bg-foreground/45" />
      </span>
      <span className={cn(tick, "right-0 top-0")}>
        <span className="absolute right-0 top-1/2 h-px w-full bg-foreground/45" />
        <span className="absolute left-1/2 top-0 h-full w-px bg-foreground/45" />
      </span>
      <span className={cn(tick, "bottom-0 left-0")}>
        <span className="absolute bottom-1/2 left-0 h-px w-full bg-foreground/45" />
        <span className="absolute bottom-0 left-1/2 h-full w-px bg-foreground/45" />
      </span>
      <span className={cn(tick, "bottom-0 right-0")}>
        <span className="absolute bottom-1/2 right-0 h-px w-full bg-foreground/45" />
        <span className="absolute bottom-0 left-1/2 h-full w-px bg-foreground/45" />
      </span>
    </div>
  );
}

/**
 * The literal product primitive — record nodes and their relationships —
 * rendered as filled circles on ruled edges, matching the reference sheets.
 * Colored via `currentColor`, so wrap in a text-color utility.
 */
export function NodeGraphGlyph({ className }: { className?: string }) {
  const nodes: Array<[number, number, number]> = [
    [96, 34, 6],
    [48, 62, 5],
    [78, 66, 8],
    [112, 70, 5],
    [136, 76, 3.5],
    [58, 96, 4],
    [86, 100, 6.5],
    [30, 116, 4],
    [70, 128, 3.5],
    [46, 142, 5],
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 3],
    [3, 4],
    [1, 5],
    [2, 6],
    [5, 6],
    [5, 7],
    [6, 8],
    [7, 9],
  ];
  return (
    <svg
      viewBox="0 0 168 168"
      className={cn("h-full w-full", className)}
      fill="none"
      aria-hidden="true"
    >
      {edges.map(([a, b], i) => {
        const from = nodes[a];
        const to = nodes[b];
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke="currentColor"
            strokeWidth={1.5}
          />
        );
      })}
      {nodes.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="currentColor" />
      ))}
    </svg>
  );
}

export function DimensionRule({ className }: { className?: string }) {
  return <div className={cn("dimension-rule", className)} />;
}
