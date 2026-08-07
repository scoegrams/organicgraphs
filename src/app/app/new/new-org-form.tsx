"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createOrganization, type CreateOrgState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full" size="lg">
      {pending ? "Creating…" : "Create & choose industry"}
    </Button>
  );
}

export function NewOrgForm() {
  const [state, action] = useActionState<CreateOrgState, FormData>(
    createOrganization,
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" name="name" placeholder="Acme Studio" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What does this organization do?"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
