import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { sales, payments, saleItems } from '@/modules/sales/infrastructure/sales.schema';
import { customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { isProductUnit } from '@/shared/domain/product-unit';
import type { ReportRepository, SalesTotals, SalesWindowData } from '../domain/report-repository.port';

export type ReportDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

const TOP_PRODUCTS = 10;

export class DrizzleReportRepository<TSchema extends Record<string, unknown>> implements ReportRepository {
  constructor(private readonly database: ReportDatabase<TSchema>) {}

  async getConfirmedTotals(merchantId: string, start: Date, end: Date): Promise<SalesTotals> {
    return this.totalsByStatus(merchantId, 'CONFIRMED', start, end);
  }

  async getSalesWindow(merchantId: string, start: Date, end: Date, timeZone: string): Promise<SalesWindowData> {
    const confirmedInWindow = and(
      eq(sales.merchantId, merchantId),
      eq(sales.status, 'CONFIRMED'),
      gte(sales.createdAt, start),
      lt(sales.createdAt, end)
    );

    const [confirmed, cancelled, byPayment, byDay, topProducts, byOperator, fiadoReceived] = await Promise.all([
      this.totalsByStatus(merchantId, 'CONFIRMED', start, end),
      this.totalsByStatus(merchantId, 'CANCELLED', start, end),

      // What each method took in: the amount of the payment, never the cash handed over (the change is not a sale).
      this.database
        .select({
          method: payments.method,
          count: sql<number>`count(*)::int`,
          amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text`,
        })
        .from(payments)
        .innerJoin(sales, eq(payments.saleId, sales.id))
        .where(and(confirmedInWindow, eq(payments.status, 'APPROVED')))
        .groupBy(payments.method),

      // The day is the day in the shop's time zone, so a sale at 22:00 in Brasília is not moved to the next day.
      // Grouped and ordered by position (1): the same expression written twice would be two different parameters.
      this.database
        .select({
          date: sql<string>`to_char(${sales.createdAt} at time zone ${timeZone}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
        })
        .from(sales)
        .where(confirmedInWindow)
        .groupBy(sql`1`)
        .orderBy(sql`1`),

      this.database
        .select({
          name: sql<string>`max(${saleItems.productName})`,
          unit: saleItems.unit,
          quantity: sql<string>`sum(${saleItems.quantity})::bigint::text`,
          amount: sql<string>`coalesce(sum(${saleItems.subtotal}), 0)::text`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(confirmedInWindow)
        .groupBy(saleItems.productId, saleItems.unit)
        .orderBy(desc(sql`sum(${saleItems.subtotal})`), sql`max(${saleItems.productName})`)
        .limit(TOP_PRODUCTS),

      this.database
        .select({
          operatorId: sales.operatorId,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
        })
        .from(sales)
        .where(confirmedInWindow)
        .groupBy(sales.operatorId)
        .orderBy(desc(sql`sum(${sales.total})`), sales.operatorId),

      // Fiado paid back at the counter. The refund of a cancelled sale is also a CREDIT, but it points at a sale.
      this.database
        .select({ amount: sql<string>`coalesce(sum(${customerCreditLedger.amount}), 0)::text` })
        .from(customerCreditLedger)
        .where(
          and(
            eq(customerCreditLedger.merchantId, merchantId),
            eq(customerCreditLedger.type, 'CREDIT'),
            isNull(customerCreditLedger.saleId),
            gte(customerCreditLedger.createdAt, start),
            lt(customerCreditLedger.createdAt, end)
          )
        ),
    ]);

    return {
      confirmed,
      cancelled,
      byPayment,
      byDay,
      topProducts: topProducts.map((row) => ({
        name: row.name,
        unit: isProductUnit(row.unit) ? row.unit : 'UN',
        quantity: Number(row.quantity),
        amount: row.amount,
      })),
      byOperator,
      fiadoReceived: fiadoReceived[0]?.amount ?? '0',
    };
  }

  private async totalsByStatus(merchantId: string, status: string, start: Date, end: Date): Promise<SalesTotals> {
    const [row] = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.merchantId, merchantId),
          eq(sales.status, status),
          gte(sales.createdAt, start),
          lt(sales.createdAt, end)
        )
      );
    return { count: row?.count ?? 0, total: row?.total ?? '0' };
  }
}
