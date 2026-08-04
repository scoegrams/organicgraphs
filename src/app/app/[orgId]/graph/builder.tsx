"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createRecord, fuzzySearchRecords } from "./actions";
import type { GraphPayload } from "./graph-explorer";
import {
  looksLikeVendor,
  preferredTypesForAnchor,
} from "@/lib/graph/brain-link";

type Field = GraphPayload["types"][number]["fields"][number];

/** Ordered by how often you reach for them (developer UX default). */
const CHIP_ORDER = [
  "person",
  "feature",
  "product",
  "vendor",
  "service",
  "customer",
  "repository",
];

export interface BuilderAnchor {
  id: string;
  name: string;
  typeKey: string;
  typeName: string;
}

function relOptionsFor(
  typeKey: string,
  data: GraphPayload,
  typeName: Map<string, string>,
) {
  const out: { value: string; label: string; otherTypeKey: string }[] = [];
  for (const r of data.relationshipTypes) {
    if (r.sourceTypeKey === typeKey) {
      out.push({
        value: `outgoing:${r.key}`,
        label: `${r.forwardLabel} → ${typeName.get(r.targetTypeKey) ?? r.targetTypeKey}`,
        otherTypeKey: r.targetTypeKey,
      });
    }
    if (r.targetTypeKey === typeKey) {
      out.push({
        value: `incoming:${r.key}`,
        label: `${r.reverseLabel} → ${typeName.get(r.sourceTypeKey) ?? r.sourceTypeKey}`,
        otherTypeKey: r.sourceTypeKey,
      });
    }
  }
  return out;
}

/** Single "link to" row — relationship + pick a record. */
interface LinkRow {
  rel: string;
  otherId: string;
}

export function RecordBuilder({
  orgId,
  data,
  anchor,
  onClose,
  onCreated,
}: {
  orgId: string;
  data: GraphPayload;
  anchor?: BuilderAnchor;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const typeName = useMemo(
    () => new Map(data.types.map((t) => [t.key, t.name])),
    [data.types],
  );

  // Types ordered for this anchor context.
  const orderedTypes = useMemo(() => {
    const pref = anchor
      ? preferredTypesForAnchor(anchor.typeKey)
      : CHIP_ORDER;
    const rank = (key: string) => {
      const i = pref.indexOf(key);
      return i === -1 ? 1000 : i;
    };
    return [...data.types].sort((a, b) => {
      if (anchor) {
        const aOk = relOptionsFor(a.key, data, typeName).some(
          (o) => o.otherTypeKey === anchor.typeKey,
        );
        const bOk = relOptionsFor(b.key, data, typeName).some(
          (o) => o.otherTypeKey === anchor.typeKey,
        );
        if (aOk !== bOk) return aOk ? -1 : 1;
      }
      return rank(a.key) - rank(b.key);
    });
  }, [anchor, data, typeName]);

  // Visible chips: top 6 (or all if ≤ 7).
  const chipTypes = useMemo(() => orderedTypes.slice(0, 6), [orderedTypes]);
  const overflowTypes = useMemo(() => orderedTypes.slice(6), [orderedTypes]);
  const [showOverflow, setShowOverflow] = useState(false);

  // Default to first in ordered list.
  const initialType = useMemo(() => {
    if (anchor) {
      const t = orderedTypes.find((t) =>
        relOptionsFor(t.key, data, typeName).some(
          (o) => o.otherTypeKey === anchor.typeKey,
        ),
      );
      if (t) return t.key;
    }
    return orderedTypes[0]?.key ?? "";
  }, [anchor, orderedTypes, data, typeName]);

  const [typeKey, setTypeKey] = useState<string>(initialType);
  const [name, setName] = useState("");
  const [reuseId, setReuseId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: string; name: string; score?: number }[]
  >([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [linkRow, setLinkRow] = useState<LinkRow>({ rel: "", otherId: "" });
  const [anchorRel, setAnchorRel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const nameWrapRef = useRef<HTMLDivElement>(null);

  const selectedType = data.types.find((t) => t.key === typeKey);

  // Focus name on mount.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Local matches of same type.
  const localMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    const ofType = data.nodes.filter((n) => n.typeKey === typeKey);
    const filtered = q
      ? ofType.filter((n) => n.name.toLowerCase().includes(q))
      : ofType;
    return filtered.slice(0, 8).map((n) => ({ id: n.id, name: n.name }));
  }, [name, typeKey, data.nodes]);

  // Postgres fuzzy for typos / near-matches.
  useEffect(() => {
    const q = name.trim();
    if (q.length < 1 || reuseId) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void fuzzySearchRecords(orgId, q, typeKey).then((res) => {
        if (cancelled || !res.hits) return;
        setSuggestions(
          res.hits.map((h) => ({
            id: h.id,
            name: h.displayName,
            score: h.score,
          })),
        );
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [name, typeKey, orgId, reuseId]);

  const mergedSuggestions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; score?: number }>();
    for (const s of localMatches) byId.set(s.id, s);
    for (const s of suggestions) {
      if (!byId.has(s.id)) byId.set(s.id, s);
    }
    return Array.from(byId.values()).slice(0, 8);
  }, [localMatches, suggestions]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!nameWrapRef.current?.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Relationship options for this type.
  const relOptions = useMemo(
    () => relOptionsFor(typeKey, data, typeName),
    [typeKey, data, typeName],
  );

  // Anchor connection options.
  const anchorRelOptions = useMemo(
    () =>
      anchor
        ? relOptions.filter((o) => o.otherTypeKey === anchor.typeKey)
        : [],
    [anchor, relOptions],
  );

  useEffect(() => {
    setAnchorRel(anchorRelOptions[0]?.value ?? "");
  }, [anchorRelOptions]);

  // Smart "link to" — relationship options for the secondary connection,
  // excluding the anchor if present (that's already wired).
  const linkRelOptions = useMemo(() => {
    if (anchor) return relOptions.filter((o) => o.otherTypeKey !== anchor.typeKey);
    return relOptions;
  }, [relOptions, anchor]);

  // Default link row rel when type changes.
  useEffect(() => {
    setLinkRow({ rel: linkRelOptions[0]?.value ?? "", otherId: "" });
  }, [typeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Candidates for the link row.
  const linkCandidates = useMemo(() => {
    const opt = linkRelOptions.find((o) => o.value === linkRow.rel);
    if (!opt) return [];
    return data.nodes.filter((n) => n.typeKey === opt.otherTypeKey);
  }, [linkRow.rel, linkRelOptions, data.nodes]);

  const nodesByType = useMemo(() => {
    const m = new Map<string, GraphPayload["nodes"]>();
    for (const n of data.nodes) {
      const list = m.get(n.typeKey) ?? [];
      list.push(n);
      m.set(n.typeKey, list);
    }
    return m;
  }, [data.nodes]);

  function selectType(key: string) {
    setTypeKey(key);
    setName("");
    setReuseId(null);
    setSuggestions([]);
    setShowSuggest(false);
    setValues({});
    setError(null);
    setShowOverflow(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  function pickExisting(id: string, displayName: string) {
    setName(displayName);
    setReuseId(id);
    setShowSuggest(false);
    setError(null);
  }

  function setValue(key: string, v: unknown) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give the record a name.");
      nameRef.current?.focus();
      return;
    }
    if (anchor && !anchorRel) {
      setError(`Pick how this connects to ${anchor.name}.`);
      return;
    }

    let saveType = typeKey;
    if (!reuseId && looksLikeVendor(name) && typeKey !== "vendor") {
      const vendorCanLink =
        !anchor ||
        relOptionsFor("vendor", data, typeName).some(
          (o) => o.otherTypeKey === anchor.typeKey,
        );
      if (vendorCanLink) saveType = "vendor";
    }
    const saveAnchorRel =
      saveType === typeKey
        ? anchorRel
        : relOptionsFor(saveType, data, typeName).find(
            (o) => o.otherTypeKey === anchor?.typeKey,
          )?.value ?? anchorRel;

    const connections = [
      ...(anchor && saveAnchorRel
        ? [{ rel: saveAnchorRel, otherId: anchor.id }]
        : []),
      ...(linkRow.rel && linkRow.otherId ? [linkRow] : []),
    ]
      .filter((r) => r.rel && r.otherId)
      .map((r) => {
        const [direction, relationshipTypeKey] = r.rel.split(":");
        return {
          relationshipTypeKey: relationshipTypeKey!,
          direction: direction as "outgoing" | "incoming",
          otherId: r.otherId,
        };
      });

    if (anchor && connections.every((c) => c.otherId !== anchor.id)) {
      setError(`Nothing links to ${anchor.name}. Choose a relationship above.`);
      return;
    }

    startTransition(async () => {
      const res = await createRecord(orgId, {
        recordTypeKey: saveType,
        displayName: name.trim(),
        values: reuseId ? {} : values,
        connections,
        ...(reuseId ? { existingId: reuseId } : {}),
      });
      if (res.error) setError(res.error);
      else if (res.id) onCreated(res.id);
    });
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-card sm:w-[26rem]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {anchor ? "Extend" : "New record"}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold tracking-tight">
            {anchor ? `Build from ${anchor.name}` : "Add to graph"}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close builder"
          className="rounded-md px-1.5 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Type chips */}
        <div className="space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            What are you adding?
          </span>
          <div className="flex flex-wrap gap-1.5">
            {chipTypes.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectType(t.key)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  typeKey === t.key
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-foreground hover:border-accent/60 hover:bg-accent/10"
                }`}
              >
                {t.name}
              </button>
            ))}
            {overflowTypes.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOverflow((v) => !v)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                    showOverflow || overflowTypes.some((t) => t.key === typeKey)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-muted-foreground hover:border-accent/60"
                  }`}
                >
                  {overflowTypes.find((t) => t.key === typeKey)?.name ?? "More…"}
                </button>
                {showOverflow && (
                  <div className="absolute left-0 top-full z-10 mt-1 min-w-[9rem] rounded-md border border-border bg-card shadow-md">
                    {overflowTypes.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => selectType(t.key)}
                        className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-secondary ${
                          typeKey === t.key ? "font-semibold text-accent" : ""
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Name with autocomplete */}
        <div className="relative space-y-1.5" ref={nameWrapRef}>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Name
          </span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              setReuseId(null);
              setShowSuggest(true);
              if (
                looksLikeVendor(v) &&
                typeKey !== "vendor" &&
                data.types.some((t) => t.key === "vendor")
              ) {
                setTypeKey("vendor");
              }
            }}
            onFocus={() => setShowSuggest(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !showSuggest) save();
            }}
            placeholder={`${selectedType?.name ?? "Record"} name…`}
            autoComplete="off"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {reuseId ? (
            <p className="text-xs text-accent">
              Reusing existing node — will connect, not duplicate.
            </p>
          ) : null}
          {showSuggest && !reuseId && mergedSuggestions.length > 0 ? (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%-0.25rem)] z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-card shadow-sm"
            >
              {mergedSuggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pickExisting(s.id, s.name)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-secondary"
                  >
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="ml-auto shrink-0 rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                      existing
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Anchor connection */}
        {anchor ? (
          <div className="space-y-2 rounded-md border border-accent/40 bg-accent/[0.05] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Connected to
            </p>
            <p className="text-sm font-medium">
              {anchor.name}{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {anchor.typeName}
              </span>
            </p>
            {anchorRelOptions.length > 0 ? (
              <select
                value={anchorRel}
                onChange={(e) => setAnchorRel(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {anchorRelOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No relationship links a {selectedType?.name ?? "record"} to a{" "}
                {anchor.typeName}. Pick another type above.
              </p>
            )}
          </div>
        ) : null}

        {/* Smart "Link to" — one row for connecting to an existing node */}
        {linkRelOptions.length > 0 ? (
          <div className="space-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {anchor ? "Also link to" : "Link to project / product"}
            </span>
            <div className="flex gap-2">
              <select
                value={linkRow.rel}
                onChange={(e) =>
                  setLinkRow({ rel: e.target.value, otherId: "" })
                }
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Relationship…</option>
                {linkRelOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {linkRow.rel ? (
              <select
                value={linkRow.otherId}
                onChange={(e) =>
                  setLinkRow((r) => ({ ...r, otherId: e.target.value }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">
                  {linkCandidates.length
                    ? `Choose a ${typeName.get(linkRelOptions.find((o) => o.value === linkRow.rel)?.otherTypeKey ?? "") ?? "record"}…`
                    : "None yet — add one first"}
                </option>
                {linkCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        {/* Optional fields for the selected type (collapsed when reusing) */}
        {!reuseId && selectedType && selectedType.fields.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground group-open:text-foreground">
              Optional fields ▸
            </summary>
            <div className="mt-3 space-y-3">
              {selectedType.fields.map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  value={values[f.key]}
                  onChange={(v) => setValue(f.key, v)}
                />
              ))}
            </div>
          </details>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={pending || !name.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {pending
            ? "Adding…"
            : reuseId
              ? "Connect existing"
              : anchor
                ? "Add & connect"
                : "Add to graph"}
        </button>
      </div>
    </aside>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {field.name}
    </span>
  );
  const base =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  if (field.type === "status" || field.type === "single_select") {
    return (
      <label className="block space-y-1.5">
        {label}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "long_text") {
    return (
      <label className="block space-y-1.5">
        {label}
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span>{field.name}</span>
      </label>
    );
  }

  const inputType =
    field.type === "number" || field.type === "currency" || field.type === "percentage"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "datetime"
          ? "datetime-local"
          : field.type === "email"
            ? "email"
            : field.type === "url"
              ? "url"
              : "text";

  return (
    <label className="block space-y-1.5">
      {label}
      <input
        type={inputType}
        value={(value as string | number | undefined) ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(undefined);
          onChange(inputType === "number" ? Number(v) : v);
        }}
        className={base}
      />
    </label>
  );
}
