"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { authenticate, registerUser } from "@/lib/accounts";
import { acceptInvitationForUser } from "@/lib/invitations";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

const EmailField = z.string().trim().email("Enter a valid email address.");

const SignInSchema = z.object({
  email: EmailField,
  password: z.string().min(1, "Enter your password."),
});

const SignUpSchema = z.object({
  email: EmailField,
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
  name: z.string().trim().max(120).optional(),
});

export type AuthFormState = { error?: string };

/** Only ever redirect to a path on this site, never to an attacker's URL. */
function safeNext(raw: FormData): string {
  const next = raw.get("next");
  if (typeof next !== "string") return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const result = await authenticate(parsed.data);
  if (!result.ok) return { error: result.error };

  await createSession(result.user);
  await acceptInvitationForUser(formData.get("invite"), result.user);
  redirect(safeNext(formData));
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) return { error: result.error };

  await createSession(result.user);
  await acceptInvitationForUser(formData.get("invite"), result.user);
  redirect(safeNext(formData));
}
