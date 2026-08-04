"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listNearDuplicates,
  mergeDuplicatePair,
} from "./actions";

type DuplicatePair = NonNullable<
  Awaited<ReturnType<typeof listNearDuplicates>>["pairs"]
>[number];

export function MergeDupesPanel({
  orgId,
  onClose,
  onMerged,
}: {
  orgId: string;
  onClose: () => void;
  onMerged: (summary: string) => void;
}) {
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [merging, startMerge] = useTransition();

  function scan() {
    setError(null);
    startLoad(async () => {
      const res = await listNearDuplicates(orgId);
      if (res.error) setError(res.error);
      else setPairs(res.pairs ?? []);
    });
  }

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  function merge(p: DuplicatePair) {
    startMerge(async () => {
      const res = await mergeDuplicatePair(orgId, p.keepId, p.dropId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setPairs((prev) =>
        (prev ?? []).filter(
          (x) => x.dropId !== p.dropId && x.keepId !== p.dropId,
        ),
      );
      onMerged(`Merged “${p.dropName}” → “${p.keepName}”`);
    });
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card sm:w-[26rem]">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            pg_trgm
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">
            Merge near-duplicates
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-1.5 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-xs text-muted-foreground">
          Postgres fuzzy-matches names of the same type (e.g. Vance / vance).
          Keep the left record; the right is deleted and its links are re-pointed.
        </p>

        {loading && !pairs ? (
          <p className="text-sm text-muted-foreground">Scanning…</p>
        ) : null}

        {pairs && pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No near-duplicates found. Graph looks clean.
          </p>
        ) : null}

        <ul className="space-y-2">
          {(pairs ?? []).map((p) => (
            <li
              key={`${p.keepId}-${p.dropId}`}
              className="rounded-md border border-border/70 p-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {p.recordTypeKey} · {(p.score * 100).toFixed(0)}% similar
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">{p.keepName}</span>
                <span className="mx-2 text-muted-foreground">←</span>
                <span className="text-muted-foreground line-through">
                  {p.dropName}
                </span>
              </p>
              <button
                onClick={() => merge(p)}
                disabled={merging}
                className="mt-2 rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
              >
                Merge into {p.keepName}
              </button>
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-3">
        <button
          onClick={scan}
          disabled={loading}
          className="w-full rounded-md border border-input px-3 py-2 text-sm transition hover:bg-secondary disabled:opacity-60"
        >
          {loading ? "Scanning…" : "Rescan"}
        </button>
      </div>
    </aside>
  );
}
