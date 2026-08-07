"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveDesignPack, type DesignPackInput } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLORS: { key: keyof Pick<DesignPackInput, "colorPrimary" | "colorSecondary" | "colorAccent" | "colorNeutral">; label: string; hint: string }[] = [
  { key: "colorPrimary",   label: "Primary",   hint: "Main brand color — headings, key UI elements" },
  { key: "colorSecondary", label: "Background", hint: "Page ground — should feel like paper or canvas" },
  { key: "colorAccent",    label: "Accent",     hint: "Highlight color — links, badges, calls to action" },
  { key: "colorNeutral",   label: "Neutral",    hint: "Supporting text, borders, muted elements" },
];

export function DesignPackEditor({
  orgId,
  orgName,
  initial,
}: {
  orgId: string;
  orgName: string;
  initial: DesignPackInput & { isPublic: boolean };
}) {
  const router = useRouter();
  const [pack, setPack] = useState<DesignPackInput>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(update: Partial<DesignPackInput>) {
    setPack((p) => ({ ...p, ...update }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveDesignPack(orgId, pack);
      if (res.error) {
        setError(res.error);
      } else {
        setSaved(true);
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Color palette */}
      <section>
        <h2 className="mb-1 text-lg font-bold tracking-tight">Color palette</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Four colors define how {orgName} appears on its preview page.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {COLORS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-start gap-4">
              {/* Color swatch / picker */}
              <label className="group relative cursor-pointer">
                <span
                  className="block h-14 w-14 shrink-0 rounded-md border-2 border-border shadow-sm transition group-hover:border-foreground"
                  style={{ background: pack[key] as string }}
                />
                <input
                  type="color"
                  value={pack[key] as string}
                  onChange={(e) => patch({ [key]: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={`Pick ${label} color`}
                />
              </label>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {(pack[key] as string).toUpperCase()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Identity */}
      <section>
        <h2 className="mb-1 text-lg font-bold tracking-tight">Identity</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          A tagline and optional logo URL for your preview page.
        </p>
        <div className="space-y-5 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={pack.tagline ?? ""}
              onChange={(e) => patch({ tagline: e.target.value || undefined })}
              placeholder="The best burger in Boston"
              maxLength={160}
            />
          </div>
        </div>
      </section>

      {/* Visibility */}
      <section>
        <h2 className="mb-1 text-lg font-bold tracking-tight">Visibility</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          When public, anyone with the link can view the preview.
        </p>
        <label className="flex cursor-pointer items-center gap-3">
          <div
            role="switch"
            aria-checked={pack.isPublic}
            onClick={() => patch({ isPublic: !pack.isPublic })}
            className={`relative h-6 w-11 rounded-full border-2 transition ${
              pack.isPublic
                ? "border-primary bg-primary"
                : "border-border bg-background"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                pack.isPublic ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm font-medium">
            {pack.isPublic ? "Public — anyone with the link" : "Private — members only"}
          </span>
        </label>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save design pack"}
        </Button>
        <Link
          href={`/preview/${orgId}`}
          target="_blank"
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-5 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          View preview →
        </Link>
        {saved && (
          <span className="text-sm text-green-700 dark:text-green-400">Saved</span>
        )}
        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}
