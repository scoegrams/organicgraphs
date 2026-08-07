"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Joining…" : "Accept invitation"}
    </Button>
  );
}

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, formAction] = useActionState<AcceptInviteState, FormData>(
    acceptInviteAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
