import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/password";

describe("password validation", () => {
  it("requires a workable length", () => {
    expect(validatePassword("short")).toContain(String(MIN_PASSWORD_LENGTH));
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects the passwords that lead every credential-stuffing list", () => {
    expect(validatePassword("password123")).toMatch(/too common/);
    expect(validatePassword("PassWord123")).toMatch(/too common/);
  });

  it("rejects absurdly long input rather than hashing it", () => {
    expect(validatePassword("a".repeat(500))).toMatch(/too long/);
  });
});

describe("password hashing", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
  });

  it("salts, so the same password never produces the same hash", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("correct horse battery staple", b)).toBe(true);
  });

  it("stores its parameters so they can be raised later", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const [scheme, n, r, p] = hash.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(2 ** 14);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it("never stores the password in the hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct");
  });

  it("returns false instead of throwing on missing or corrupt hashes", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$0$0$0$$")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$1$2$3$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("treats unicode-equivalent passwords as the same", async () => {
    // "é" composed vs decomposed — a user's keyboard should not lock them out.
    const hash = await hashPassword("caf\u00e9-password");
    expect(await verifyPassword("cafe\u0301-password", hash)).toBe(true);
  });
});
