import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultClient } from "@/lib/db";

// Minimal transaction-capable Prisma client type.
type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append an audit event. Pass a transaction client to keep the audit write in
 * the same transaction as the mutation it records.
 */
export async function recordAudit(input: AuditInput, db: Db = defaultClient) {
  return db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata ?? {},
    },
  });
}
