import { db } from '@/shared/infrastructure/db/connection';
import { auditEvents } from './audit.schema';
import { AuditPort } from '../domain/audit.port';

export class DrizzleAuditService implements AuditPort {
  async record(
    merchantId: string,
    eventType: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await db.insert(auditEvents).values({
      merchantId,
      eventType,
      actorId,
      aggregateType,
      aggregateId,
      details,
    });
  }
}

export { DrizzleAuditService as DrizzleAuditAdapter };
