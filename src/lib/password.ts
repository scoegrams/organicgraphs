import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and built in, which avoids shipping a native module
 * (bcrypt/argon2) that has to compile on the deploy host. Parameters are
 * encoded into the stored string so they can be raised later without
 * invalidating existing hashes.
 */

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// ~64 MB of memory per hash: costly to attack in bulk, fine for a login.
const PARAMS = { N: 2 ** 16, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// Node's default maxmem is 32 MB, which N=2^16 exceeds.
const MAX_MEM = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Rejects the passwords that show up first in every credential-stuffing list.
 * Deliberately short: length is the requirement that actually helps, and
 * character-class rules mostly push people toward "Password1!".
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou1",
  "admin12345",
  "welcome123",
  "changeme123",
]);

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return "That password is too long.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Pick something less guessable.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time verification. Returns false for malformed or unknown-format
 * hashes rather than throwing, so a corrupt row cannot 500 the login route.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltRaw!, "base64");
    expected = Buffer.from(hashRaw!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Spends roughly the same time as a real verification when no account exists,
 * so response timing does not reveal which emails are registered.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await scrypt("no-such-account", crypto.randomBytes(SALT_BYTES), KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
}
