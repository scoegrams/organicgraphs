"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { SystemRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  type InviteState,
} from "./actions";

const ROLES: { value: SystemRole; label: string; blurb: string }[] = [
  { value: "OWNER", label: "Owner", blurb: "Full control, including people" },
  { value: "ADMIN", label: "Admin", blurb: "Manage schema, records, and people" },
  { value: "MANAGER", label: "Manager", blurb: "Add and edit records" },
  { value: "CONTRIBUTOR", label: "Contributor", blurb: "Add and edit records" },
  { value: "VIEWER", label: "Viewer", blurb: "Read-only" },
];

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: SystemRole;
  joinedAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: SystemRole;
  expiresAt: string;
}

function InviteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create invite link"}
    </Button>
  );
}

export function MembersClient({
  orgId,
  canManage,
  viewerRole,
  currentUserId,
  members,
  invitations,
}: {
  orgId: string;
  canManage: boolean;
  viewerRole: SystemRole;
  currentUserId: string;
  members: Member[];
  invitations: PendingInvite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [inviteState, inviteAction] = useActionState<InviteState, FormData>(
    inviteMemberAction.bind(null, orgId),
    {},
  );

  const inviteUrl = inviteState.inviteUrl
    ? `${typeof window === "undefined" ? "" : window.location.origin}${inviteState.inviteUrl}`
    : null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error === "__left__") {
        router.push("/app");
        return;
      }
      if (res.error) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={inviteAction} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1 space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  placeholder="teammate@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  name="role"
                  defaultValue="CONTRIBUTOR"
                  className="h-12 rounded-md border border-border bg-card px-4 text-base"
                >
                  {ROLES.filter((r) => r.value !== "OWNER" || viewerRole === "OWNER").map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.blurb}
                    </option>
                  ))}
                </select>
              </div>
              <InviteSubmit />
            </form>

            {inviteState.error ? (
              <p role="alert" className="text-sm text-destructive">
                {inviteState.error}
              </p>
            ) : null}

            {inviteUrl ? (
              <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
                <p className="text-sm font-semibold">
                  Invite ready for {inviteState.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send them this link. It works once and expires in 14 days.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-transparent px-3 py-3 transition hover:border-border"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.name ?? m.email}
                  {m.userId === currentUserId ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      you
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>

              {canManage ? (
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={(e) =>
                    run(() => changeRoleAction(orgId, m.id, e.target.value as SystemRole))
                  }
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                >
                  {ROLES.filter((r) => r.value !== "OWNER" || viewerRole === "OWNER").map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {m.role}
                </span>
              )}

              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => removeMemberAction(orgId, m.id))}
                  className="text-destructive hover:bg-destructive/10"
                >
                  {m.userId === currentUserId ? "Leave" : "Remove"}
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {canManage && invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {invitations.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-transparent px-3 py-3 transition hover:border-border"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.role.toLowerCase()} · expires{" "}
                    {new Date(i.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => revokeInviteAction(orgId, i.id))}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Withdraw
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
