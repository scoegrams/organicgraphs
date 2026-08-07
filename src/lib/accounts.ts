import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  fakeVerifyDelay,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/password";

/**
 * Credential handling: registration, sign-in, and login throttling.
 *
 * Session issuing lives in `auth.ts`; this module only decides whether a set of
 * credentials is good.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// After this many consecutive failures the account starts locking, with the
// lockout doubling each further attempt up to the cap.
const FAILURES_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

function lockoutFor(failureCount: number): Date | null {
  if (failureCount < FAILURES_BEFORE_LOCKOUT) return null;
  const steps = failureCount - FAILURES_BEFORE_LOCKOUT;
  const ms = Math.min(BASE_LOCKOUT_MS * 2 ** steps, MAX_LOCKOUT_MS);
  return new Date(Date.now() + ms);
}

function minutesUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 60_000));
}

export type AuthOutcome =
  | { ok: true; user: User }
  | { ok: false; error: string };

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthOutcome> {
  const email = normalizeEmail(input.email);
  const problem = validatePassword(input.password);
  if (problem) return { ok: false, error: problem };

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Accounts made by the old passwordless sign-in have no hash. Let the owner
  // of that address claim it by setting one, rather than stranding them.
  if (existing?.passwordHash) {
    return { ok: false, error: "An account with that email already exists. Sign in instead." };
  }

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || email.split("@")[0]!;

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, name, failedLoginCount: 0, lockedUntil: null },
      })
    : await prisma.user.create({ data: { email, passwordHash, name } });

  return { ok: true, user };
}

export async function authenticate(input: {
  email: string;
  password: string;
}): Promise<AuthOutcome> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });

  // Same wording and similar timing whether or not the address exists, so this
  // route cannot be used to enumerate accounts.
  const genericFailure = { ok: false as const, error: "Email or password is incorrect." };

  if (!user) {
    await fakeVerifyDelay();
    return genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${minutesUntil(user.lockedUntil)} minute(s).`,
    };
  }

  if (!user.passwordHash) {
    await fakeVerifyDelay();
    return {
      ok: false,
      error: "This account has no password yet. Use “Create account” with this email to set one.",
    };
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil: lockoutFor(failedLoginCount) },
    });
    return genericFailure;
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  return { ok: true, user };
}
