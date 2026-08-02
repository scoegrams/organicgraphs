"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loadSampleCompany } from "./actions";

export function DemoDataButton({ orgId }: { orgId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const res = await loadSampleCompany(orgId);
            setIsError(Boolean(res.error));
            setMsg(res.error ?? res.message ?? null);
          })
        }
      >
        {pending ? "Loading…" : "Load sample company"}
      </Button>
      {msg ? (
        <p
          className={
            isError
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
