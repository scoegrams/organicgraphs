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
  PARTICIPANT_GROUPS,
  PARTICIPANT_LABELS,
  PERSON_ROLES,
  SYSTEMS,
  SYSTEM_LABELS,
  HOSTING_PROVIDERS,
  HOSTING_PROVIDER_LABELS,
  TEAM_TOOLS,
  TEAM_TOOL_LABELS,
  DOMAIN_REGISTRARS,
  DOMAIN_REGISTRAR_LABELS,
  WIZARD_STEPS,
  type WizardAnswers,
} from "@/lib/wizard";
import { completeWizard, saveWizardStep } from "./actions";

const STEP_KEYS = ["organization", "participants", "value", "systems", "security"] as const;

function toText(arr: string[]): string {
  return arr.join(", ");
}
/** Parse a comma/newline list into stored values. Call after the user finishes typing —
 *  never drive the input `value` from this on every keystroke or commas disappear. */
function toArray(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
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

export function WizardClient({
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
  const [idx, setIdx] = useState(initialStepIndex);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Draft strings for comma-separated fields so typing "," isn't eaten by toArray.
  const [locationDraft, setLocationDraft] = useState(
    toText(initialAnswers.organization.locations),
  );
  const [customGroupsDraft, setCustomGroupsDraft] = useState(
    toText(initialAnswers.participants.custom),
  );

  const isLast = idx === STEP_KEYS.length - 1;
  const stepKey = STEP_KEYS[idx]!;

  function patch<K extends keyof WizardAnswers>(
    section: K,
    value: Partial<WizardAnswers[K]>,
  ) {
    setAnswers((a) => ({ ...a, [section]: { ...a[section], ...value } }));
  }

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
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
        // A redirect from completeWizard throws a control-flow signal; ignore it.
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
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Tell us how your organization works
        </h1>
      </div>

      <Stepper current={idx} />

      <Card className="relative">
        <CornerTicks />
        <CardHeader>
          <CardTitle>{WIZARD_STEPS[idx]!.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {stepKey === "organization" && (
            <>
              <Field label="Description">
                <Textarea
                  value={answers.organization.description ?? ""}
                  onChange={(e) => patch("organization", { description: e.target.value })}
                  placeholder="A sentence or two about what this organization does."
                />
              </Field>
              <Field label="Locations" hint="Comma-separated.">
                <Input
                  value={locationDraft}
                  onChange={(e) => {
                    const text = e.target.value;
                    setLocationDraft(text);
                    patch("organization", { locations: toArray(text) });
                  }}
                  placeholder="New York, Remote"
                />
              </Field>
              <Field label="Approximate team size">
                <select
                  className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                  value={answers.organization.teamSize ?? ""}
                  onChange={(e) => patch("organization", { teamSize: e.target.value })}
                >
                  <option value="">Select…</option>
                  {["1–10", "11–50", "51–200", "201–1000", "1000+"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Primary business goals">
                <Textarea
                  value={answers.organization.goals ?? ""}
                  onChange={(e) => patch("organization", { goals: e.target.value })}
                  placeholder="e.g. Grow revenue, reduce project delays, improve compliance."
                />
              </Field>
            </>
          )}

          {stepKey === "participants" && (
            <>
              <p className="text-sm text-muted-foreground">
                Which groups interact with your company?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PARTICIPANT_GROUPS.map((g) => (
                  <CheckRow
                    key={g}
                    label={PARTICIPANT_LABELS[g]}
                    checked={answers.participants.groups.includes(g)}
                    onChange={() =>
                      patch("participants", {
                        groups: toggle(answers.participants.groups, g),
                      })
                    }
                  />
                ))}
              </div>
              <Field label="Other groups" hint="Comma-separated.">
                <Input
                  value={customGroupsDraft}
                  onChange={(e) => {
                    const text = e.target.value;
                    setCustomGroupsDraft(text);
                    patch("participants", { custom: toArray(text) });
                  }}
                  placeholder="Investors, Volunteers"
                />
              </Field>
              <div className="border-t pt-4">
                <Field
                  label="Your people"
                  hint="Each teammate becomes a Person node. Add founders, engineers, investors, advisors."
                >
                  <PeopleList
                    people={answers.participants.people}
                    onChange={(people) => patch("participants", { people })}
                  />
                </Field>
              </div>
            </>
          )}

          {stepKey === "value" && (
            <>
              <Field label="What does the company sell or deliver?">
                <Input
                  value={answers.valueAndWork.sells ?? ""}
                  onChange={(e) => patch("valueAndWork", { sells: e.target.value })}
                />
              </Field>
              <Field label="Primary unit of work" hint="e.g. project, title, merchant, feature.">
                <Input
                  value={answers.valueAndWork.primaryUnit ?? ""}
                  onChange={(e) => patch("valueAndWork", { primaryUnit: e.target.value })}
                />
              </Field>
              <Field
                label="Projects / apps you build"
                hint="Each becomes a Product node. Add the client it's built for to link Client → Project (e.g. “Car Nodes App” for “Toyota”)."
              >
                <ProjectList
                  projects={answers.valueAndWork.projects}
                  onChange={(projects) => patch("valueAndWork", { projects })}
                />
              </Field>
              <Field
                label="Features and how they connect"
                hint="Each feature becomes a node linked to its project, the service it runs in, its owner, and the features it depends on."
              >
                <FeatureList
                  features={answers.valueAndWork.features}
                  projects={answers.valueAndWork.projects.map((p) => p.name)}
                  services={answers.valueAndWork.services}
                  people={answers.participants.people.map((p) => p.name)}
                  onChange={(features) => patch("valueAndWork", { features })}
                />
              </Field>
              <Field
                label="Stages the work passes through"
                hint="In order, top to bottom. We'll turn these into a workflow."
              >
                <StageList
                  stages={answers.valueAndWork.stages}
                  onChange={(stages) => patch("valueAndWork", { stages })}
                />
              </Field>
              <Field label="Outputs or documents produced">
                <Textarea
                  value={answers.valueAndWork.outputs ?? ""}
                  onChange={(e) => patch("valueAndWork", { outputs: e.target.value })}
                />
              </Field>
              <CheckRow
                label="Deadlines matter to this organization"
                checked={answers.valueAndWork.deadlinesMatter}
                onChange={(v) => patch("valueAndWork", { deadlinesMatter: v })}
              />
              <Field label="What commonly causes work to become blocked?">
                <Textarea
                  value={answers.valueAndWork.blockers ?? ""}
                  onChange={(e) => patch("valueAndWork", { blockers: e.target.value })}
                />
              </Field>
            </>
          )}

          {stepKey === "systems" && (
            <>
              <Field
                label="Services or apps you run"
                hint="Each row becomes a Service node. Define these before your features so each feature can point at the service it runs in. e.g. Web app, API, Background worker."
              >
                <StageList
                  stages={answers.valueAndWork.services}
                  onChange={(services) => patch("valueAndWork", { services })}
                  addLabel="+ Add service"
                  placeholders={["e.g. Web app", "e.g. API", "e.g. Background worker"]}
                />
              </Field>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Where does information currently live? These are configuration
                  choices — no external systems are connected in this MVP.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SYSTEMS.map((s) => (
                  <CheckRow
                    key={s}
                    label={SYSTEM_LABELS[s]}
                    checked={answers.systems.selected.includes(s)}
                    onChange={() =>
                      patch("systems", { selected: toggle(answers.systems.selected, s) })
                    }
                  />
                ))}
              </div>
              <Field label="Other systems">
                <Input
                  value={answers.systems.other ?? ""}
                  onChange={(e) => patch("systems", { other: e.target.value })}
                />
              </Field>

              <div className="border-t pt-4">
                <p className="mb-3 text-base font-semibold">Where do you host or deploy?</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Each selection creates a Vendor node linked to your services.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {HOSTING_PROVIDERS.map((h) => (
                    <CheckRow
                      key={h}
                      label={HOSTING_PROVIDER_LABELS[h]}
                      checked={answers.systems.hostingProviders.includes(h)}
                      onChange={() =>
                        patch("systems", {
                          hostingProviders: toggle(answers.systems.hostingProviders, h),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-base font-semibold">Domain registrars &amp; DNS</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Where did you buy or manage your domain? Creates a Vendor node linked to your product.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DOMAIN_REGISTRARS.map((d) => (
                    <CheckRow
                      key={d}
                      label={DOMAIN_REGISTRAR_LABELS[d]}
                      checked={answers.systems.domainRegistrars.includes(d)}
                      onChange={() =>
                        patch("systems", {
                          domainRegistrars: toggle(answers.systems.domainRegistrars, d),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-base font-semibold">What SaaS tools does the team use?</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Each selection creates a Vendor node your team can be linked to.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TEAM_TOOLS.map((t) => (
                    <CheckRow
                      key={t}
                      label={TEAM_TOOL_LABELS[t]}
                      checked={answers.systems.teamTools.includes(t)}
                      onChange={() =>
                        patch("systems", {
                          teamTools: toggle(answers.systems.teamTools, t),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {stepKey === "security" && (
            <>
              <Field label="What information is confidential?">
                <Textarea
                  value={answers.security.confidentialInfo ?? ""}
                  onChange={(e) => patch("security", { confidentialInfo: e.target.value })}
                />
              </Field>
              <Field label="Which roles may access financial information?">
                <Input
                  value={answers.security.financialRoles ?? ""}
                  onChange={(e) => patch("security", { financialRoles: e.target.value })}
                  placeholder="e.g. Finance, Owners"
                />
              </Field>
              <Field label="Which roles may access employee information?">
                <Input
                  value={answers.security.employeeInfoRoles ?? ""}
                  onChange={(e) => patch("security", { employeeInfoRoles: e.target.value })}
                  placeholder="e.g. HR, Managers"
                />
              </Field>
              <CheckRow
                label="Regulated or highly sensitive information is involved"
                checked={answers.security.regulatedData}
                onChange={(v) => patch("security", { regulatedData: v })}
              />
              <CheckRow
                label="AI-created changes must always require approval"
                checked={answers.security.requireAiApproval}
                onChange={(v) => patch("security", { requireAiApproval: v })}
              />
              {answers.security.regulatedData ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Heads up: OrgGraph does not store medical records (PHI),
                  cardholder data (PCI), authentication secrets, or complete
                  payment credentials. Restricted records will require an explicit
                  access policy, and a health check will flag any that lack one.
                </p>
              ) : null}
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
          {pending
            ? "Saving…"
            : isLast
              ? "Generate recommendation"
              : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = WIZARD_STEPS.slice(0, 5);
  return (
    <ol className="relative flex justify-between">
      <div
        className="absolute left-3 right-3 top-[13px] h-px bg-border"
        aria-hidden="true"
      />
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.key}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Ordered stage editor — one row per stage, not a CSV string. */
function StageList({
  stages,
  onChange,
  addLabel = "+ Add stage",
  placeholders,
}: {
  stages: string[];
  onChange: (stages: string[]) => void;
  addLabel?: string;
  placeholders?: string[];
}) {
  const [rows, setRows] = useState<string[]>(() =>
    stages.length > 0 ? [...stages] : [""],
  );

  function commit(next: string[]) {
    const display = next.length > 0 ? next : [""];
    setRows(display);
    onChange(next.map((s) => s.trim()).filter(Boolean));
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((stage, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <Input
              value={stage}
              onChange={(e) => {
                const next = [...rows];
                next[i] = e.target.value;
                commit(next);
              }}
              onBlur={() => {
                commit(rows.map((s) => s.trim()).filter(Boolean));
              }}
              placeholder={placeholders?.[i] ?? (i === 0 ? "e.g. Intake" : i === 1 ? "e.g. In progress" : "Next stage")}
              aria-label={`Item ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !stage.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
              aria-label={`Remove item ${i + 1}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() =>
          commit([...rows.map((s) => s.trim()).filter(Boolean), ""])
        }
        className="text-sm font-medium text-accent transition hover:underline"
      >
        {addLabel}
      </button>
    </div>
  );
}

type PersonRow = { name: string; role?: string };

/** Employee capture — one row per teammate (name + role). */
function PeopleList({
  people,
  onChange,
}: {
  people: PersonRow[];
  onChange: (people: PersonRow[]) => void;
}) {
  const [rows, setRows] = useState<PersonRow[]>(() =>
    people.length > 0 ? [...people] : [{ name: "" }],
  );

  function commit(next: PersonRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          ...(p.role ? { role: p.role } : {}),
        })),
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={row.name}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i]!, name: e.target.value };
                commit(next);
              }}
              placeholder="Name"
              aria-label={`Person ${i + 1} name`}
            />
            <select
              className="h-12 w-44 shrink-0 rounded-md border border-input bg-background px-2 text-base"
              value={row.role ?? ""}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i]!, role: e.target.value || undefined };
                commit(next);
              }}
              aria-label={`Person ${i + 1} role`}
            >
              <option value="">Role…</option>
              {PERSON_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
              aria-label={`Remove person ${i + 1}`}
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
        + Add person
      </button>
    </div>
  );
}

type ProjectRow = { name: string; client?: string };

/** Project capture — the app you build (Product) + the client it's built for. */
function ProjectList({
  projects,
  onChange,
}: {
  projects: ProjectRow[];
  onChange: (projects: ProjectRow[]) => void;
}) {
  const [rows, setRows] = useState<ProjectRow[]>(() =>
    projects.length > 0 ? [...projects] : [{ name: "" }],
  );

  function commit(next: ProjectRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          ...(p.client?.trim() ? { client: p.client.trim() } : {}),
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
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i]!, name: e.target.value };
                commit(next);
              }}
              placeholder="Project / app name"
              aria-label={`Project ${i + 1} name`}
            />
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              for
            </span>
            <Input
              className="w-40 shrink-0"
              value={row.client ?? ""}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i]!, client: e.target.value || undefined };
                commit(next);
              }}
              placeholder="Client (optional)"
              aria-label={`Project ${i + 1} client`}
            />
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1 && !row.name.trim()}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
              aria-label={`Remove project ${i + 1}`}
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
        + Add project
      </button>
    </div>
  );
}

type FeatureRow = {
  name: string;
  project?: string;
  service?: string;
  owner?: string;
  dependsOn?: string[];
};

/** Feature capture — name + project + service + owner + feature dependencies. */
function FeatureList({
  features,
  projects,
  services,
  people,
  onChange,
}: {
  features: FeatureRow[];
  projects: string[];
  services: string[];
  people: string[];
  onChange: (features: FeatureRow[]) => void;
}) {
  const [rows, setRows] = useState<FeatureRow[]>(() =>
    features.length > 0 ? [...features] : [{ name: "" }],
  );

  function commit(next: FeatureRow[]) {
    setRows(next.length > 0 ? next : [{ name: "" }]);
    onChange(
      next
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          ...(f.project ? { project: f.project } : {}),
          ...(f.service ? { service: f.service } : {}),
          ...(f.owner ? { owner: f.owner } : {}),
          ...(f.dependsOn && f.dependsOn.length ? { dependsOn: f.dependsOn } : {}),
        })),
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-3">
        {rows.map((row, i) => {
          // Other features (by name) available as dependencies for this row.
          const otherNames = rows
            .map((r) => r.name.trim())
            .filter((n, j) => n && j !== i);
          const deps = row.dependsOn ?? [];
          return (
            <li key={i} className="space-y-2 rounded-md border border-border/70 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[8rem] flex-1"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i]!, name: e.target.value };
                    commit(next);
                  }}
                  placeholder="Feature name"
                  aria-label={`Feature ${i + 1} name`}
                />
                {projects.length > 0 ? (
                  <select
                    className="h-12 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-base"
                    value={row.project ?? ""}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, project: e.target.value || undefined };
                      commit(next);
                    }}
                    aria-label={`Feature ${i + 1} project`}
                  >
                    <option value="">Project…</option>
                    {projects.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="h-12 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-base"
                  value={row.service ?? ""}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i]!, service: e.target.value || undefined };
                    commit(next);
                  }}
                  aria-label={`Feature ${i + 1} service`}
                >
                  <option value="">Runs in…</option>
                  {services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="h-12 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-base"
                  value={row.owner ?? ""}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i]!, owner: e.target.value || undefined };
                    commit(next);
                  }}
                  aria-label={`Feature ${i + 1} owner`}
                >
                  <option value="">Owner…</option>
                  {people.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => commit(rows.filter((_, j) => j !== i))}
                  disabled={rows.length <= 1 && !row.name.trim()}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-30"
                  aria-label={`Remove feature ${i + 1}`}
                >
                  Remove
                </button>
              </div>
              {otherNames.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    depends on
                  </span>
                  {deps.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        const next = [...rows];
                        next[i] = {
                          ...next[i]!,
                          dependsOn: deps.filter((x) => x !== d),
                        };
                        commit(next);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-xs text-foreground transition hover:border-primary"
                    >
                      {d}
                      <span className="text-muted-foreground">✕</span>
                    </button>
                  ))}
                  <select
                    className="h-9 rounded-md border border-input bg-background px-1.5 text-sm"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const next = [...rows];
                      next[i] = {
                        ...next[i]!,
                        dependsOn: [...deps, v].filter(
                          (x, j, a) => a.indexOf(x) === j,
                        ),
                      };
                      commit(next);
                    }}
                    aria-label={`Feature ${i + 1} dependencies`}
                  >
                    <option value="">+ add…</option>
                    {otherNames
                      .filter((n) => !deps.includes(n))
                      .map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => commit([...rows, { name: "" }])}
        className="text-sm font-medium text-accent transition hover:underline"
      >
        + Add feature
      </button>
    </div>
  );
}
