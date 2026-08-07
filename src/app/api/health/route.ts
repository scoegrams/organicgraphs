import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment healthcheck.
 *
 * Checks the database round-trip rather than just returning 200, so a release
 * that cannot reach Postgres never gets promoted to serving traffic.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch {
    // The reason is logged by the client; the response stays generic on purpose.
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 },
    );
  }
}
