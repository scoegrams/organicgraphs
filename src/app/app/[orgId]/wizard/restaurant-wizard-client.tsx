"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CornerTicks } from "@/components/construction-marks";
import { cn } from "@/lib/utils";
import {
  RESTAURANT_STAFF_ROLES,
  DISH_CATEGORIES,
  MENU_TYPES,
  type WizardAnswers,
} from "@/lib/wizard";
import { completeWizard, saveWizardStep } from "./actions";

// ---------------------------------------------------------------------------
// Restaurant wizard steps (4 steps, simpler than software)
// 1. Restaurant   — name, locations, description
// 2. Team         — staff list with hospitality roles
// 3. Menu & dishes — menus + dishes with chef assignment
// 4. Supply chain — suppliers + POS + reservations
// ---------------------------------------------------------------------------

const RESTAURANT_STEPS = [
  { key: "organization", label: "Restaurant" },
  { key: "participants", label: "Team" },
  { key: "value",        label: "Menu & dishes" },
  { key: "systems",      label: "Supply chain" },
] as const;

type RestaurantStepKey = (typeof RESTAURANT_STEPS)[number]["key"];

function toText(arr: string[]): string {
  return arr.join(", ");
}
function toArray(text: string): string[] {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition hover:bg-secondary">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function RestaurantWizardClient({
  orgId,
  orgName,
  initialAnswers,
  initialStepIndex,
}: {
  orgId: string;
  orgName: string;
  initialAnswers: WizardAnswers;
  initialStepIndex: number;
}) {
  const [answers, setAnswers] = useState<WizardAnswers>(initialAnswers);
  const [idx, setIdx] = useState(Math.min(initialStepIndex, RESTAURANT_STEPS.length - 1));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [locationDraft, setLocationDraft] = useState(
    toText(initialAnswers.organization.locations),
  );

  const isLast = idx === RESTAURANT_STEPS.length - 1;
  const stepKey = RESTAURANT_STEPS[idx]!.key as RestaurantStepKey;

  function patch<K extends keyof WizardAnswers>(section: K, value: Partial<WizardAnswers[K]>) {
    setAnswers((a) => ({ ...a, [section]: { ...a[section], ...value } }));
  }

  function patchRestaurant(value: Partial<WizardAnswers["restaurant"]>) {
    setAnswers((a) => ({ ...a, restaurant: { ...a.restaurant, ...value } }));
  }

  function next() {
    setError(null);
    startTransition(async () => {
      try {
        if (isLast) {
          await completeWizard(orgId, answers);
        } else {
          await saveWizardStep(orgId, stepKey, answers);
          setIdx((i) => i + 1);
        }
      } catch (e) {
        if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) return;
        setError((e as Error).message || "Something went wrong. Try again.");
      }
    });
  }

  function back() {
    setError(null);
    setIdx((i) => Math.max(0, i - 1));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Setup wizard · {orgName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Tell us how your restaurant works
        </h1>
      </div>

      <Stepper current={idx} />

      <Card className="relative">
        <CornerTicks />
        <CardHeader>
          <CardTitle>{RESTAURANT_STEPS[idx]!.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ── Step 1: Restaurant ───────────────────────────────────────── */}
          {stepKey === "organization" && (
            <>
              <Field label="About the restaurant">
                <Textarea
                  value={answers.organization.description ?? ""}
                  onChange={(e) => patch("organization", { description: e.target.value })}
                  placeholder="e.g. A neighborhood Italian bistro known for handmade pasta and natural wine."
                />
              </Field>
              <Field
                label="Locations"
                hint="One location per line or comma-separated. Each becomes a Location node."
              >
                <Input
                  value={locationDraft}
                  onChange={(e) => {
                    const text = e.target.value;
                    setLocationDraft(text);
                    patch("organization", { locations: toArray(text) });
                  }}
                  placeholder="Downtown, Midtown, Williamsburg"
                />
              </Field>
              <Field label="Size">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={answers.organization.teamSize ?? ""}
                  onChange={(e) => patch("organization", { teamSize: e.target.value })}
                >
                  <option value="">Number of staff…</option>
                  {["1–10", "11–25", "26–50", "51–100", "100+"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {/* ── Step 2: Team ─────────────────────────────────────────────── */}
          {stepKey === "participants" && (
            <>
              <p className="text-sm text-muted-foreground">
                Add your team. Each person becomes a Staff node you can later connect to dishes, locations, and events.
              </p>
              <StaffList
                staff={answers.participants.people}
                onChange={(people) => patch("participants", { people })}
              />
            </>
          )}

          {/* ── Step 3: Menu & dishes ─────────────────────────────────────── */}
          {stepKey === "value" && (
            <>
              <Field
                label="Menus"
                hint="e.g. Dinner Menu, Brunch, Happy Hour, Tasting Menu. Each becomes a Menu node."
              >
                <MenuList
                  menus={answers.valueAndWork.projects}
                  onChange={(projects) => patch("valueAndWork", { projects })}
                />
              </Field>
              <div className="border-t pt-4">
                <Field
                  label="Signature dishes"
                  hint="Add your key dishes. Assign each to a menu and a chef — both become graph connections."
                >
                  <DishList
                    dishes={answers.valueAndWork.features}
                    menus={answers.valueAndWork.projects.map((p) => p.name)}
                    staff={answers.participants.people.map((p) => p.name)}
                    onChange={(features) => patch("valueAndWork", { features })}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Step 4: Supply chain ─────────────────────────────────────── */}
          {stepKey === "systems" && (
            <>
              <Field
                label="Suppliers"
                hint="Your food and beverage purveyors — produce, meat, seafood, dairy, wine. Each becomes a Supplier node."
              >
                <SupplierList
                  suppliers={answers.restaurant.suppliers}
                  onChange={(suppliers) => patchRestaurant({ suppliers })}
                />
              </Field>

              <div className="border-t pt-4">
                <p className="mb-1 text-sm font-medium">Operational software</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  POS, reservations, scheduling, delivery, payroll — everything that runs the restaurant.
                  Each becomes a Vendor node grouped under your location.
                </p>
                <OperationalVendorList
                  vendors={answers.restaurant.operationalVendors}
                  onChange={(operationalVendors) => patchRestaurant({ operationalVendors })}
                />
              </div>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={idx === 0 || pending}>
          Back
        </Button>
        <Button onClick={next} disabled={pending}>
          {pending ? "Saving…" : isLast ? "Generate recommendation" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stepper({ current }: { current: number }) {
  return (
    <ol className="relative flex justify-between">
      <div
        className="absolute left-3 right-3 top-[13px] h-px bg-border"
        aria-hidden="true"
      />
      {RESTAURANT_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center gap-2">
            <span
              className={cn(
                "flex h-[26px] w-[26px] items-center justify-center rounded-full border bg-background",
                (done || active) && "border-primary",
                !done && !active && "border-border",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  done || active ? "bg-primary" : "bg-border",
                )}
              />
            </span>
            <span
              className={cn(
                "max-w-[6.5rem] text-center text-xs leading-tight",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff list — name + hospitality role
// ---------------------------------------------------------------------------
type PersonRow = { name: string; role?: string };

function StaffList({ staff, onChange }: { staff: PersonRow[]; onChange: (s: PersonRow[]) => void }) {
  const [rows, setRows] = useState<PersonRow[]>(() =>
    staff.length > 0 ? [...staff] : [{ name: "" }],
  );

  function commit(next: PersonRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), ...(p.role ? { role: p.role } : {}) })),
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={row.name}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, name: e.target.value }; commit(next); }}
              placeholder="Name"
              aria-label={`Staff ${i + 1} name`}
            />
            <select
              className="h-10 w-44 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
              value={row.role ?? ""}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, role: e.target.value || undefined }; commit(next); }}
              aria-label={`Staff ${i + 1} role`}
            >
              <option value="">Role…</option>
              {RESTAURANT_STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => commit([...rows, { name: "" }])}
        className="text-sm font-medium text-accent transition hover:underline"
      >
        + Add staff member
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu list — name + type tag
// ---------------------------------------------------------------------------
type MenuRow = { name: string; client?: string };

function MenuList({ menus, onChange }: { menus: MenuRow[]; onChange: (m: MenuRow[]) => void }) {
  const [rows, setRows] = useState<MenuRow[]>(() =>
    menus.length > 0 ? [...menus] : [{ name: "" }],
  );

  function commit(next: MenuRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(next.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), ...(m.client ? { client: m.client } : {}) })));
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={row.name}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, name: e.target.value }; commit(next); }}
              placeholder={i === 0 ? "e.g. Dinner Menu" : i === 1 ? "e.g. Brunch" : "Menu name"}
              aria-label={`Menu ${i + 1} name`}
            />
            <select
              className="h-10 w-40 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
              value={row.client ?? ""}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, client: e.target.value || undefined }; commit(next); }}
              aria-label={`Menu ${i + 1} type`}
            >
              <option value="">Type…</option>
              {MENU_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => commit([...rows, { name: "" }])}
        className="text-sm font-medium text-accent transition hover:underline"
      >
        + Add menu
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dish list — name + menu + category + chef
// ---------------------------------------------------------------------------
type DishRow = {
  name: string;
  project?: string;
  service?: string;
  owner?: string;
};

function DishList({
  dishes,
  menus,
  staff,
  onChange,
}: {
  dishes: DishRow[];
  menus: string[];
  staff: string[];
  onChange: (d: DishRow[]) => void;
}) {
  const [rows, setRows] = useState<DishRow[]>(() =>
    dishes.length > 0 ? [...dishes] : [{ name: "" }],
  );

  function commit(next: DishRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          ...(d.project ? { project: d.project } : {}),
          ...(d.service ? { service: d.service } : {}),
          ...(d.owner ? { owner: d.owner } : {}),
        })),
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[8rem] flex-1"
              value={row.name}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, name: e.target.value }; commit(next); }}
              placeholder="Dish name"
              aria-label={`Dish ${i + 1} name`}
            />
            {/* Category stored in `service` field for reuse with existing schema */}
            <select
              className="h-10 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
              value={row.service ?? ""}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, service: e.target.value || undefined }; commit(next); }}
              aria-label={`Dish ${i + 1} category`}
            >
              <option value="">Category…</option>
              {DISH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {menus.length > 0 && (
              <select
                className="h-10 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                value={row.project ?? ""}
                onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, project: e.target.value || undefined }; commit(next); }}
                aria-label={`Dish ${i + 1} menu`}
              >
                <option value="">Menu…</option>
                {menus.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {staff.length > 0 && (
              <select
                className="h-10 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                value={row.owner ?? ""}
                onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, owner: e.target.value || undefined }; commit(next); }}
                aria-label={`Dish ${i + 1} chef`}
              >
                <option value="">Chef…</option>
                {staff.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => commit([...rows, { name: "" }])}
        className="text-sm font-medium text-accent transition hover:underline"
      >
        + Add dish
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier list — name + category
// ---------------------------------------------------------------------------
type SupplierRow = { name: string; category?: string };

const SUPPLIER_CATEGORIES = ["Produce", "Meat", "Seafood", "Dairy", "Bakery", "Wine & spirits", "Specialty", "Dry goods"];

function SupplierList({
  suppliers,
  onChange,
}: {
  suppliers: SupplierRow[];
  onChange: (s: SupplierRow[]) => void;
}) {
  const [rows, setRows] = useState<SupplierRow[]>(() =>
    suppliers.length > 0 ? [...suppliers] : [{ name: "" }],
  );

  function commit(next: SupplierRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((s) => s.name.trim())
        .map((s) => ({ name: s.name.trim(), ...(s.category ? { category: s.category } : {}) })),
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={row.name}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, name: e.target.value }; commit(next); }}
              placeholder={i === 0 ? "e.g. Green Acres Farm" : "Supplier name"}
              aria-label={`Supplier ${i + 1} name`}
            />
            <select
              className="h-10 w-40 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
              value={row.category ?? ""}
              onChange={(e) => { const next = [...rows]; next[i] = { ...next[i]!, category: e.target.value || undefined }; commit(next); }}
              aria-label={`Supplier ${i + 1} category`}
            >
              <option value="">Category…</option>
              {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => commit([...rows, { name: "" }])}
        className="text-sm font-medium text-accent transition hover:underline"
      >
        + Add supplier
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operational vendor list — POS, reservations, scheduling, delivery, etc.
// All lumped into one list; each becomes a Vendor node.
// ---------------------------------------------------------------------------

const KNOWN_OP_VENDORS: { name: string; category: string }[] = [
  { name: "Toast",       category: "POS" },
  { name: "Square",      category: "POS" },
  { name: "Lightspeed",  category: "POS" },
  { name: "Clover",      category: "POS" },
  { name: "OpenTable",   category: "Reservations" },
  { name: "Resy",        category: "Reservations" },
  { name: "SevenRooms",  category: "Reservations" },
  { name: "Tock",        category: "Reservations" },
  { name: "7shifts",     category: "Scheduling" },
  { name: "HotSchedules",category: "Scheduling" },
  { name: "DoorDash",    category: "Delivery" },
  { name: "Uber Eats",   category: "Delivery" },
  { name: "Grubhub",     category: "Delivery" },
];

const OP_VENDOR_CATEGORIES = [
  "POS", "Reservations", "Scheduling", "Delivery", "Payroll",
  "Accounting", "Linen & laundry", "Waste", "Comms", "Marketing", "Other",
];

type OpVendorRow = { name: string; category?: string };

function OperationalVendorList({
  vendors,
  onChange,
}: {
  vendors: OpVendorRow[];
  onChange: (v: OpVendorRow[]) => void;
}) {
  const selected = new Set(vendors.map((v) => v.name));

  function toggle(v: { name: string; category: string }) {
    if (selected.has(v.name)) {
      onChange(vendors.filter((r) => r.name !== v.name));
    } else {
      onChange([...vendors, { name: v.name, category: v.category }]);
    }
  }

  const [rows, setRows] = useState<OpVendorRow[]>(() =>
    vendors.filter((v) => !KNOWN_OP_VENDORS.some((k) => k.name === v.name)).length > 0
      ? vendors.filter((v) => !KNOWN_OP_VENDORS.some((k) => k.name === v.name))
      : [{ name: "" }],
  );

  function commitCustom(next: OpVendorRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    const knownSelected = vendors.filter((v) =>
      KNOWN_OP_VENDORS.some((k) => k.name === v.name),
    );
    const custom = next.filter((r) => r.name.trim());
    onChange([...knownSelected, ...custom]);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {KNOWN_OP_VENDORS.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => toggle(v)}
            className={cn(
              "flex items-center justify-between rounded-md border p-3 text-left text-sm transition",
              selected.has(v.name)
                ? "border-primary bg-primary/5 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            <span>{v.name}</span>
            <span className="text-xs opacity-60">{v.category}</span>
          </button>
        ))}
      </div>

      <div className="border-t pt-3">
        <p className="mb-2 text-xs text-muted-foreground">Other systems not listed above:</p>
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i]!, name: e.target.value };
                  commitCustom(next);
                }}
                placeholder="e.g. Tripleseat, Avero, MarketMan…"
                aria-label={`Other vendor ${i + 1}`}
              />
              <select
                className="h-10 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                value={row.category ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i]!, category: e.target.value || undefined };
                  commitCustom(next);
                }}
                aria-label={`Other vendor ${i + 1} category`}
              >
                <option value="">Category…</option>
                {OP_VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                type="button"
                onClick={() => commitCustom(rows.filter((_, j) => j !== i))}
                disabled={rows.length <= 1 && !row.name.trim()}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => commitCustom([...rows, { name: "" }])}
          className="mt-2 text-sm font-medium text-accent transition hover:underline"
        >
          + Add another
        </button>
      </div>
    </div>
  );
}
