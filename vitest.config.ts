import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Integration tests talk to the local embedded Postgres (npm run db:start).
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://orggraph:orggraph@127.0.0.1:55432/orggraph?schema=public",
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "test-secret-change-me-please-0123456789abcdef",
      AI_PROVIDER: "deterministic",
    },
    // DB tests share one worker to avoid cross-test contention.
    poolOptions: { threads: { singleThread: true } },
  },
});
