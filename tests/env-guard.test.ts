import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `assertProductionEnv` latches after its first run, so each case needs a fresh
// module instance.
async function check(env: Record<string, string | undefined>): Promise<string | null> {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    vi.resetModules();
    const { assertProductionEnv } = await import("@/lib/env");
    assertProductionEnv();
    return null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    process.env = previous;
  }
}

const GOOD_DB = "postgresql://user:pw@db.internal:5432/app";
const GOOD_SECRET = "K7d9Qm2Xz4Rt8Vw1Yp6Bn3Lc5Hf0Jg7As";

let original: NodeJS.ProcessEnv;

beforeEach(() => {
  original = { ...process.env };
});

afterEach(() => {
  process.env = original;
});

describe("production environment guard", () => {
  it("stays out of the way outside production", async () => {
    expect(await check({ NODE_ENV: "development", DATABASE_URL: undefined, AUTH_SECRET: undefined })).toBeNull();
  });

  it("does not demand runtime secrets during the build", async () => {
    expect(
      await check({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        AUTH_SECRET: undefined,
      }),
    ).toBeNull();
  });

  it("accepts a fully configured production environment", async () => {
    expect(
      await check({
        NODE_ENV: "production",
        NEXT_PHASE: undefined,
        DATABASE_URL: GOOD_DB,
        AUTH_SECRET: GOOD_SECRET,
        AI_PROVIDER: "deterministic",
      }),
    ).toBeNull();
  });

  it("refuses to start without a database URL", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: undefined,
      AUTH_SECRET: GOOD_SECRET,
    });
    expect(error).toMatch(/DATABASE_URL is not set/);
  });

  it("refuses a database URL that is not postgres", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: "mysql://user:pw@host/db",
      AUTH_SECRET: GOOD_SECRET,
    });
    expect(error).toMatch(/postgresql:\/\//);
  });

  it("refuses a short signing secret", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: GOOD_DB,
      AUTH_SECRET: "too-short",
    });
    expect(error).toMatch(/at least 32 characters/);
  });

  it("refuses a secret copied from the example file", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: GOOD_DB,
      AUTH_SECRET: "replace-with-a-long-random-string",
    });
    expect(error).toMatch(/placeholder/);
  });

  it("refuses to enable the OpenAI provider with no key", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: GOOD_DB,
      AUTH_SECRET: GOOD_SECRET,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: undefined,
    });
    expect(error).toMatch(/OPENAI_API_KEY/);
  });

  it("reports every problem at once rather than one per restart", async () => {
    const error = await check({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      DATABASE_URL: undefined,
      AUTH_SECRET: undefined,
    });
    expect(error).toMatch(/DATABASE_URL/);
    expect(error).toMatch(/AUTH_SECRET/);
  });
});
