import "server-only";

/**
 * Startup configuration check.
 *
 * A container that boots with a bad secret and only fails when the first person
 * tries to sign in is worse than one that refuses to start. This runs from the
 * root layout so a misconfigured deploy fails immediately and visibly.
 */

const MIN_SECRET_LENGTH = 32;

// A deploy that copied the example file verbatim is not configured.
const PLACEHOLDER_SECRETS = new Set([
  "change-me",
  "changeme",
  "secret",
  "dev-secret-change-me",
  "replace-with-a-long-random-string",
  "test-secret-change-me-please-0123456789abcdef",
]);

let checked = false;

export function assertProductionEnv(): void {
  if (checked || process.env.NODE_ENV !== "production") return;
  // `next build` also runs as NODE_ENV=production, but the build host has no
  // reason to hold runtime secrets. Only the running server must be configured.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  checked = true;

  const problems: string[] = [];

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    problems.push("DATABASE_URL is not set.");
  } else if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    problems.push("DATABASE_URL must be a postgresql:// connection string.");
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    problems.push("AUTH_SECRET is not set.");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production. ` +
        "Generate one with: openssl rand -base64 32",
    );
  } else if (PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    problems.push("AUTH_SECRET is still a placeholder value. Generate a real one.");
  }

  if (process.env.AI_PROVIDER === "openai" && !process.env.OPENAI_API_KEY) {
    problems.push("AI_PROVIDER is 'openai' but OPENAI_API_KEY is not set.");
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with an unsafe configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
