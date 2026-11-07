import { auditEvents } from './audit.schema';

export interface AuditEventInput {
  eventType: string;
  actorId: string;
  aggregateType: string;
  aggregateId: string;
  details: Record<string, unknown>;
}

/** The one place that maps an audit entry to an audit_events row. */
export function toAuditEventRow(merchantId: string, entry: AuditEventInput): typeof auditEvents.$inferInsert {
  return {
    merchantId,
    eventType: entry.eventType,
    actorId: entry.actorId,
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    details: entry.details,
  };
}
