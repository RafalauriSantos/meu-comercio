import { describe, it, expect } from 'vitest';
import { ListRecentSalesUseCase, RECENT_SALES_LIMIT } from './list-recent-sales.use-case';
import type { RecentSale, RecentSalesReader } from '../domain/recent-sales.port';

class FakeReader implements RecentSalesReader {
  public calls: Array<{ merchantId: string; start: Date; end: Date; limit: number }> = [];

  constructor(private readonly sales: RecentSale[] = []) {}

  async listConfirmed(merchantId: string, start: Date, end: Date, limit: number): Promise<RecentSale[]> {
    this.calls.push({ merchantId, start, end, limit });
    return this.sales;
  }
}

// 22:30 in Brasília on 9 Nov 2026, which is already 10 Nov in UTC.
const LATE_EVENING = new Date('2026-11-10T01:30:00Z');

describe('ListRecentSalesUseCase', () => {
  it('asks for the sales of today in Brasília time, even when it is already tomorrow in UTC', async () => {
    const reader = new FakeReader();

    await new ListRecentSalesUseCase(reader, () => LATE_EVENING).execute('loja-a');

    expect(reader.calls).toEqual([
      {
        merchantId: 'loja-a',
        start: new Date('2026-11-09T03:00:00.000Z'),
        end: new Date('2026-11-10T03:00:00.000Z'),
        limit: RECENT_SALES_LIMIT,
      },
    ]);
  });

  it('gives the short id of the receipt, the time and the total of each sale, as the reader ordered them', async () => {
    const reader = new FakeReader([
      { id: '550e8400-e29b-41d4-a716-446655440000', createdAt: new Date('2026-11-10T01:00:00Z'), total: '59.75', operatorId: 'tatiane', items: 'Arroz 5kg, Feijão 1kg' },
      { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', createdAt: new Date('2026-11-09T15:00:00Z'), total: '15.02', operatorId: 'marcos', items: 'Queijo Mussarela' },
    ]);

    const items = await new ListRecentSalesUseCase(reader, () => LATE_EVENING).execute('loja-a');

    expect(items).toEqual([
      { id: '550e8400-e29b-41d4-a716-446655440000', shortId: '550e8400', createdAt: '2026-11-10T01:00:00.000Z', total: '59.75', operatorId: 'tatiane', items: 'Arroz 5kg, Feijão 1kg' },
      { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', shortId: '6ba7b810', createdAt: '2026-11-09T15:00:00.000Z', total: '15.02', operatorId: 'marcos', items: 'Queijo Mussarela' },
    ]);
  });

  it('is an empty list when nothing was sold today', async () => {
    expect(await new ListRecentSalesUseCase(new FakeReader(), () => LATE_EVENING).execute('loja-a')).toEqual([]);
  });
});
