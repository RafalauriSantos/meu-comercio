import { describe, it, expect } from 'vitest';
import { GetSalesReportUseCase, TOP_PRODUCTS_LIMIT } from './get-sales-report.use-case';
import { InvalidPeriodError } from '../domain/report-period';
import type { ReportRepository, SalesTotals, SalesWindowData } from '../domain/report-repository.port';

const EMPTY_WINDOW: SalesWindowData = {
  confirmed: { count: 0, total: '0' },
  cancelled: { count: 0, total: '0' },
  byPayment: [],
  byDay: [],
  topProducts: [],
  byOperator: [],
  fiadoReceived: '0',
};

class FakeReportRepository implements ReportRepository {
  public windows: Array<{ merchantId: string; start: Date; end: Date; timeZone: string }> = [];
  public previousWindows: Array<{ merchantId: string; start: Date; end: Date }> = [];

  constructor(
    private readonly data: SalesWindowData = EMPTY_WINDOW,
    private readonly previous: SalesTotals = { count: 0, total: '0' }
  ) {}

  async getSalesWindow(merchantId: string, start: Date, end: Date, timeZone: string): Promise<SalesWindowData> {
    this.windows.push({ merchantId, start, end, timeZone });
    return this.data;
  }

  async getConfirmedTotals(merchantId: string, start: Date, end: Date): Promise<SalesTotals> {
    this.previousWindows.push({ merchantId, start, end });
    return this.previous;
  }
}

// Wednesday, 11 Nov 2026, 12:00 in Brasília.
const NOON = new Date('2026-11-11T15:00:00Z');

function useCaseWith(data?: Partial<SalesWindowData>, previous?: SalesTotals) {
  const repository = new FakeReportRepository({ ...EMPTY_WINDOW, ...data }, previous);
  return { repository, useCase: new GetSalesReportUseCase(repository, () => NOON) };
}

describe('GetSalesReportUseCase: the numbers', () => {
  it('adds up the period and gives the average sale, rounded to the cent', async () => {
    const { useCase } = useCaseWith({ confirmed: { count: 3, total: '100.0000' } });

    const report = await useCase.execute('m1', 'today');

    expect(report.summary).toEqual({ salesCount: 3, total: '100.00', averageTicket: '33.33' });
  });

  it('compares with the previous period in reais and in percent', async () => {
    const { useCase } = useCaseWith({ confirmed: { count: 5, total: '250.50' } }, { count: 4, total: '200.00' });

    const { previous } = await useCase.execute('m1', 'today');

    expect(previous).toMatchObject({ label: 'ontem', salesCount: 4, total: '200.00', changeAmount: '50.50' });
    expect(previous.changePercent).toBe(25.3);
  });

  it('shows a drop as a negative change', async () => {
    const { useCase } = useCaseWith({ confirmed: { count: 5, total: '250.00' } }, { count: 6, total: '300.00' });

    const { previous } = await useCase.execute('m1', 'week');

    expect(previous.changeAmount).toBe('-50.00');
    expect(previous.changePercent).toBe(-16.7);
    expect(previous.label).toBe('semana passada');
  });

  it('has no percent when the previous period sold nothing: there is nothing to compare', async () => {
    const { useCase } = useCaseWith({ confirmed: { count: 2, total: '80.00' } }, { count: 0, total: '0' });

    const { previous } = await useCase.execute('m1', 'today');

    expect(previous.changePercent).toBeNull();
    expect(previous.changeAmount).toBe('80.00');
  });

  it('is all zeros when nothing was sold', async () => {
    const { useCase } = useCaseWith();

    const report = await useCase.execute('m1', 'today');

    expect(report.summary).toEqual({ salesCount: 0, total: '0.00', averageTicket: '0.00' });
    expect(report.byPayment).toEqual([]);
    expect(report.topProducts).toEqual([]);
    expect(report.cancelled).toEqual({ count: 0, total: '0.00' });
    expect(report.fiado).toEqual({ sold: '0.00', received: '0.00' });
    expect(report.previous.changePercent).toBeNull();
  });
});

describe('GetSalesReportUseCase: payments, fiado and cancellations', () => {
  const payments = [
    { method: 'PIX', count: 2, amount: '50.0000' },
    { method: 'TAB', count: 1, amount: '100.5000' },
    { method: 'CASH', count: 3, amount: '100.0000' },
  ];

  it('lists the methods from the biggest to the smallest, each with its share of the total', async () => {
    const { useCase } = useCaseWith({ confirmed: { count: 5, total: '250.50' }, byPayment: payments });

    const { byPayment } = await useCase.execute('m1', 'today');

    expect(byPayment.map((row) => row.method)).toEqual(['TAB', 'CASH', 'PIX']);
    expect(byPayment.map((row) => row.amount)).toEqual(['100.50', '100.00', '50.00']);
    expect(byPayment.map((row) => row.share)).toEqual([40.1, 39.9, 20]);
    expect(byPayment.map((row) => row.count)).toEqual([1, 3, 2]);
  });

  it('separates the fiado sold (a payment by TAB) from the fiado received (debts settled)', async () => {
    const { useCase } = useCaseWith({
      confirmed: { count: 5, total: '250.50' },
      byPayment: payments,
      fiadoReceived: '75.0000',
    });

    const { fiado } = await useCase.execute('m1', 'today');

    expect(fiado).toEqual({ sold: '100.50', received: '75.00' });
  });

  it('reports the cancelled sales on their own, outside the total', async () => {
    const { useCase } = useCaseWith({
      confirmed: { count: 2, total: '90.00' },
      cancelled: { count: 1, total: '40.0000' },
    });

    const report = await useCase.execute('m1', 'today');

    expect(report.summary.total).toBe('90.00');
    expect(report.cancelled).toEqual({ count: 1, total: '40.00' });
  });

  it('gives each operator the share of the total they sold', async () => {
    const { useCase } = useCaseWith({
      confirmed: { count: 4, total: '200.00' },
      byOperator: [
        { operatorId: 'tatiane', count: 3, total: '150.00' },
        { operatorId: 'marcos', count: 1, total: '50.00' },
      ],
    });

    const { byOperator } = await useCase.execute('m1', 'today');

    expect(byOperator).toEqual([
      { operatorId: 'tatiane', salesCount: 3, total: '150.00', share: 75 },
      { operatorId: 'marcos', salesCount: 1, total: '50.00', share: 25 },
    ]);
  });
});

describe('GetSalesReportUseCase: days and products', () => {
  it('has a row for every day up to today, with zero on the days nothing was sold, and none in the future', async () => {
    const { useCase } = useCaseWith({
      confirmed: { count: 3, total: '300.00' },
      byDay: [
        { date: '2026-11-09', count: 1, total: '100.0000' },
        { date: '2026-11-11', count: 2, total: '200.0000' },
      ],
    });

    const { byDay } = await useCase.execute('m1', 'week');

    // The week is 9 to 15 Nov, today is the 11th: the 12th to the 15th have not happened.
    expect(byDay).toEqual([
      { date: '2026-11-09', salesCount: 1, total: '100.00' },
      { date: '2026-11-10', salesCount: 0, total: '0.00' },
      { date: '2026-11-11', salesCount: 2, total: '200.00' },
    ]);
  });

  it('has the days of a period that is over, all of them', async () => {
    const { useCase } = useCaseWith();

    const { byDay } = await useCase.execute('m1', 'custom', { from: '2026-11-01', to: '2026-11-03' });

    expect(byDay.map((row) => row.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('keeps only the best sellers, with the unit, so a weight shows in kg', async () => {
    const many = Array.from({ length: TOP_PRODUCTS_LIMIT + 3 }, (_, i) => ({
      name: `Produto ${i + 1}`,
      unit: 'UN' as const,
      quantity: 10 - (i % 5),
      amount: `${100 - i}.0000`,
    }));
    many[0] = { name: 'Queijo Mussarela', unit: 'KG' as unknown as 'UN', quantity: 2350, amount: '100.8200' };
    const { useCase } = useCaseWith({ topProducts: many });

    const { topProducts } = await useCase.execute('m1', 'month');

    expect(topProducts).toHaveLength(TOP_PRODUCTS_LIMIT);
    expect(topProducts[0]).toEqual({ name: 'Queijo Mussarela', unit: 'KG', quantity: 2350, amount: '100.82' });
  });
});

describe('GetSalesReportUseCase: what it asks of the database', () => {
  it('asks for the period in Brasília time and for the previous window right before it', async () => {
    const { useCase, repository } = useCaseWith();

    const report = await useCase.execute('m1', 'week');

    expect(repository.windows).toEqual([
      {
        merchantId: 'm1',
        start: new Date('2026-11-09T03:00:00.000Z'),
        end: new Date('2026-11-16T03:00:00.000Z'),
        timeZone: 'America/Sao_Paulo',
      },
    ]);
    expect(repository.previousWindows).toEqual([
      { merchantId: 'm1', start: new Date('2026-11-02T03:00:00.000Z'), end: new Date('2026-11-04T15:00:00.000Z') },
    ]);
    expect(report.period).toMatchObject({ kind: 'week', from: '2026-11-09', to: '2026-11-15', timeZone: 'America/Sao_Paulo' });
  });

  it('only ever asks for the shop it was called for', async () => {
    const { useCase, repository } = useCaseWith();

    await useCase.execute('loja-a', 'today');

    expect(repository.windows.map((w) => w.merchantId)).toEqual(['loja-a']);
    expect(repository.previousWindows.map((w) => w.merchantId)).toEqual(['loja-a']);
  });

  it('refuses a custom period that is not valid, before asking the database', async () => {
    const { useCase, repository } = useCaseWith();

    await expect(useCase.execute('m1', 'custom', { from: '2026-11-07', to: '2026-11-01' })).rejects.toThrow(InvalidPeriodError);
    expect(repository.windows).toEqual([]);
  });
});
