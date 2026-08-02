"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createDevSession } from "@/lib/auth";

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  name: z.string().trim().max(120).optional(),
});

export type SignInState = { error?: string };

export async function devSignIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  await createDevSession(parsed.data.email, parsed.data.name);
  redirect("/app");
}
