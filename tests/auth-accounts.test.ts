import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authenticate, registerUser } from "@/lib/accounts";

// Requires the local Postgres (npm run db:start). Creates and removes its own users.

const RUN_ID = `auth_${Date.now()}`;
const EMAIL = `${RUN_ID}@example.com`;
const PASSWORD = "correct horse battery staple";

async function reset() {
  await prisma.user.deleteMany({ where: { email: { startsWith: RUN_ID } } });
}

beforeEach(reset);

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("registration", () => {
  it("creates an account and normalizes the email", async () => {
    const result = await registerUser({
      email: `  ${EMAIL.toUpperCase()} `,
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.email).toBe(EMAIL);
    expect(result.user.passwordHash).toBeTruthy();
  });

  it("never stores the password as written", async () => {
    const result = await registerUser({ email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.passwordHash).not.toContain(PASSWORD);
  });

  it("refuses a second account on the same email", async () => {
    await registerUser({ email: EMAIL, password: PASSWORD });
    const second = await registerUser({ email: EMAIL, password: "another good password" });
    expect(second).toEqual({ ok: false, error: expect.stringMatching(/already exists/) });
  });

  it("lets a pre-password account claim itself by setting one", async () => {
    await prisma.user.create({ data: { email: EMAIL, name: "Legacy" } });
    const result = await registerUser({ email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
    expect((await authenticate({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("rejects a weak password before touching the database", async () => {
    const result = await registerUser({ email: EMAIL, password: "short" });
    expect(result.ok).toBe(false);
    expect(await prisma.user.findUnique({ where: { email: EMAIL } })).toBeNull();
  });
});

describe("sign-in", () => {
  beforeEach(async () => {
    await registerUser({ email: EMAIL, password: PASSWORD });
  });

  it("accepts the right password", async () => {
    const result = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const result = await authenticate({ email: EMAIL, password: "wrong password here" });
    expect(result).toEqual({ ok: false, error: "Email or password is incorrect." });
  });

  it("gives an unknown email the same answer as a wrong password", async () => {
    const unknown = await authenticate({
      email: `${RUN_ID}-nobody@example.com`,
      password: PASSWORD,
    });
    const wrong = await authenticate({ email: EMAIL, password: "wrong password here" });
    expect(unknown).toEqual(wrong);
  });

  it("clears the failure count after a success", async () => {
    await authenticate({ email: EMAIL, password: "wrong password here" });
    await authenticate({ email: EMAIL, password: PASSWORD });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});

describe("login throttling", () => {
  beforeEach(async () => {
    await registerUser({ email: EMAIL, password: PASSWORD });
  });

  it("locks the account after repeated failures", async () => {
    for (let i = 0; i < 5; i += 1) {
      await authenticate({ email: EMAIL, password: "wrong password here" });
    }
    const result = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Too many attempts/) });
  });

  it("refuses even the correct password while locked", async () => {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { failedLoginCount: 9, lockedUntil: new Date(Date.now() + 60_000) },
    });
    const result = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(false);
  });

  it("lets the correct password through once the lock has expired", async () => {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { failedLoginCount: 6, lockedUntil: new Date(Date.now() - 1000) },
    });
    const result = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
  });

  it("escalates the lockout as failures continue", async () => {
    const lockAfter = async (failures: number) => {
      await prisma.user.update({
        where: { email: EMAIL },
        data: { failedLoginCount: failures - 1, lockedUntil: null },
      });
      await authenticate({ email: EMAIL, password: "wrong password here" });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      return user.lockedUntil!.getTime() - Date.now();
    };

    const first = await lockAfter(5);
    const later = await lockAfter(8);
    expect(later).toBeGreaterThan(first);
  });
});
