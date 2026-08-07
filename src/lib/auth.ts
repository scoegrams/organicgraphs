import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Session cookies.
//
// Self-contained HMAC-signed cookie, so the app needs no external auth service.
// Credentials are checked in `accounts.ts`; this module only issues and reads
// the session. The surface (`getCurrentUser`, `createSession`, `signOut`) is
// small enough to swap for Auth.js or Clerk without touching call sites.
//
// The payload is signed but not encrypted, so it must never carry anything
// beyond the identifiers below.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "orggraph_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set it in .env (see .env.example).",
    );
  }
  return s;
}

interface SessionPayload {
  userId: string;
  email: string;
  iat: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: SessionPayload): string {
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(
    crypto.createHmac("sha256", secret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

function verify(token: string | undefined): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = base64url(
    crypto.createHmac("sha256", secret()).update(body).digest(),
  );
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.userId || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Returns the signed-in user, or null. Never throws for unauthenticated. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const payload = verify(jar.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  return user ?? null;
}

/** Issues a session cookie for an already-authenticated user. */
export async function createSession(user: User): Promise<void> {
  const token = sign({ userId: user.id, email: user.email, iat: Date.now() });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
