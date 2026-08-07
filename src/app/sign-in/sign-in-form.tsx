"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction, signUpAction, type AuthFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function SignInForm({
  next,
  invite,
  inviteEmail,
  startOn = "signin",
}: {
  next?: string;
  invite?: string;
  /** When arriving from an invite, the address is fixed to the invited one. */
  inviteEmail?: string;
  startOn?: "signin" | "signup";
}) {
  const [mode, setMode] = useState<"signin" | "signup">(startOn);
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary p-1"
      >
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={
              mode === value
                ? "rounded-md bg-card px-3 py-2 text-sm font-semibold shadow-sm"
                : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            }
          >
            {value === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {/* Remount on mode change so a stale error never carries across tabs. */}
      <form key={mode} action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {invite ? <input type="hidden" name="invite" value={invite} /> : null}

        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" type="text" autoComplete="name" placeholder="Ada Lovelace" />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            defaultValue={inviteEmail}
            readOnly={Boolean(inviteEmail)}
            required
          />
          {inviteEmail ? (
            <p className="text-xs text-muted-foreground">
              This invitation is tied to {inviteEmail}.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />
          {mode === "signup" ? (
            <p className="text-xs text-muted-foreground">
              At least 10 characters. Length beats punctuation.
            </p>
          ) : null}
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        {mode === "signin" ? (
          <SubmitButton label="Sign in" pendingLabel="Signing in…" />
        ) : (
          <SubmitButton label="Create account" pendingLabel="Creating account…" />
        )}
      </form>
    </div>
  );
}
