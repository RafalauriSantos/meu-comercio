import { describe, it, expect } from 'vitest';
import { toAuditEventRow } from './audit-event-row';

describe('toAuditEventRow', () => {
  it('maps an audit entry to the audit_events row for the merchant', () => {
    const row = toAuditEventRow('merchant-1', {
      eventType: 'SALE_CONFIRMED',
      actorId: 'op-1',
      aggregateType: 'SALE',
      aggregateId: 'sale-1',
      details: { total: '10.00' },
    });

    expect(row).toEqual({
      merchantId: 'merchant-1',
      eventType: 'SALE_CONFIRMED',
      actorId: 'op-1',
      aggregateType: 'SALE',
      aggregateId: 'sale-1',
      details: { total: '10.00' },
    });
  });
});
