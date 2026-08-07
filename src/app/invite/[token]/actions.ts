"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/tenant";
import { acceptInvitation } from "@/lib/invitations";

export type AcceptInviteState = { error?: string };

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    return { error: "That invitation link is not valid." };
  }

  const user = await requireUser();
  const result = await acceptInvitation(token, user);
  if (!result.ok) return { error: result.error };

  redirect(`/app/${result.organizationId}/workspace`);
}
