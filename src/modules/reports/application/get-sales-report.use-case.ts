import { Money } from '@/shared/domain/money';
import type { ProductUnit } from '@/shared/domain/product-unit';
import {
  REPORT_TIME_ZONE,
  eachDay,
  localDateOf,
  resolvePeriod,
  type PeriodKind,
  type ReportPeriod,
} from '../domain/report-period';
import type { ReportRepository } from '../domain/report-repository.port';

export const TOP_PRODUCTS_LIMIT = 10;

export interface SalesReport {
  period: { kind: PeriodKind; label: string; from: string; to: string; timeZone: string };
  summary: { salesCount: number; total: string; averageTicket: string };
  previous: {
    label: string;
    salesCount: number;
    total: string;
    /** This period minus the previous one, in reais (can be negative). */
    changeAmount: string;
    /** In percent, one decimal. Null when the previous period sold nothing, so there is nothing to compare. */
    changePercent: number | null;
  };
  byPayment: Array<{ method: string; amount: string; share: number; count: number }>;
  byDay: Array<{ date: string; salesCount: number; total: string }>;
  topProducts: Array<{ name: string; unit: ProductUnit; quantity: number; amount: string }>;
  byOperator: Array<{ operatorId: string; salesCount: number; total: string; share: number }>;
  cancelled: { count: number; total: string };
  fiado: { sold: string; received: string };
}

/** Rounds to the cent, half up, as the rest of the system does when it writes an amount. */
function cents(value: Money): Money {
  return Money.fromDecimal(value.toDecimal());
}

function money(text: string): Money {
  return Money.fromDecimal(text);
}

/** `part` as a percent of `whole`, one decimal; 0 when there is no whole. */
function percentOf(part: Money, whole: Money): number {
  if (!whole.isPositive()) return 0;
  // Thousandths of the whole, rounded, then one decimal: 333.33 -> 333 -> 33.3 (and never "-0").
  return (Math.round(Number(part.multiply(1000).divide(whole.toDecimal()).toDecimal())) / 10) || 0;
}

export class GetSalesReportUseCase {
  constructor(
    private readonly repository: ReportRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async execute(
    merchantId: string,
    kind: PeriodKind,
    custom: { from?: string; to?: string } = {}
  ): Promise<SalesReport> {
    const now = this.clock();
    const period = resolvePeriod(kind, now, { ...custom, timeZone: REPORT_TIME_ZONE });

    const [data, previousTotals] = await Promise.all([
      this.repository.getSalesWindow(merchantId, period.start, period.end, REPORT_TIME_ZONE),
      this.repository.getConfirmedTotals(merchantId, period.previous.start, period.previous.end),
    ]);

    const total = cents(money(data.confirmed.total));
    const salesCount = data.confirmed.count;
    const averageTicket = salesCount > 0 ? cents(total.divide(salesCount)) : Money.zero();

    const previousTotal = cents(money(previousTotals.total));
    const changeAmount = total.subtract(previousTotal);
    const changePercent = previousTotal.isPositive() ? percentOf(changeAmount, previousTotal) : null;

    const byPayment = data.byPayment
      .map((row) => ({ method: row.method, amount: cents(money(row.amount)), count: row.count }))
      .sort((a, b) => (b.amount.greaterThan(a.amount) ? 1 : b.amount.equals(a.amount) ? 0 : -1))
      .map((row) => ({
        method: row.method,
        amount: row.amount.toDecimal(),
        share: percentOf(row.amount, total),
        count: row.count,
      }));

    const fiadoSold = data.byPayment.find((row) => row.method === 'TAB');

    return {
      period: { kind: period.kind, label: period.label, from: period.from, to: period.to, timeZone: REPORT_TIME_ZONE },
      summary: { salesCount, total: total.toDecimal(), averageTicket: averageTicket.toDecimal() },
      previous: {
        label: period.previous.label,
        salesCount: previousTotals.count,
        total: previousTotal.toDecimal(),
        changeAmount: changeAmount.toDecimal(),
        changePercent,
      },
      byPayment,
      byDay: this.fillDays(period, now, data.byDay),
      topProducts: data.topProducts.slice(0, TOP_PRODUCTS_LIMIT).map((row) => ({
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        amount: cents(money(row.amount)).toDecimal(),
      })),
      byOperator: data.byOperator.map((row) => ({
        operatorId: row.operatorId,
        salesCount: row.count,
        total: cents(money(row.total)).toDecimal(),
        share: percentOf(cents(money(row.total)), total),
      })),
      cancelled: { count: data.cancelled.count, total: cents(money(data.cancelled.total)).toDecimal() },
      fiado: {
        sold: cents(money(fiadoSold?.amount ?? '0')).toDecimal(),
        received: cents(money(data.fiadoReceived)).toDecimal(),
      },
    };
  }

  /** One row per day of the period up to today, with zero on the days nothing was sold, so the days line up. */
  private fillDays(period: ReportPeriod, now: Date, rows: Array<{ date: string; count: number; total: string }>) {
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const lastDay = localDateOf(now, REPORT_TIME_ZONE);
    const until = period.to < lastDay ? period.to : lastDay;
    const days = period.from <= until ? eachDay(period.from, until) : [];

    return days.map((date) => {
      const row = byDate.get(date);
      return { date, salesCount: row?.count ?? 0, total: cents(money(row?.total ?? '0')).toDecimal() };
    });
  }
}
