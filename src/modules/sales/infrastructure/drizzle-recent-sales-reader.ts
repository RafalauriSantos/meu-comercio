import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Money } from '@/shared/domain/money';
import type { RecentSale, RecentSalesReader } from '../domain/recent-sales.port';
import { sales, saleItems } from './sales.schema';

export type RecentSalesDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

export class DrizzleRecentSalesReader<TSchema extends Record<string, unknown>> implements RecentSalesReader {
  constructor(private readonly database: RecentSalesDatabase<TSchema>) {}

  async listConfirmed(merchantId: string, start: Date, end: Date, limit: number): Promise<RecentSale[]> {
    const rows = await this.database
      .select({
        id: sales.id,
        createdAt: sales.createdAt,
        total: sales.total,
        operatorId: sales.operatorId,
        items: sql<string>`coalesce(string_agg(${saleItems.productName}, ', ' order by ${saleItems.productName}), '')`,
      })
      .from(sales)
      .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(
        and(
          eq(sales.merchantId, merchantId),
          eq(sales.status, 'CONFIRMED'),
          gte(sales.createdAt, start),
          lt(sales.createdAt, end)
        )
      )
      .groupBy(sales.id)
      .orderBy(desc(sales.createdAt), desc(sales.id))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      total: Money.fromDecimal(row.total).toDecimal(),
      operatorId: row.operatorId,
      items: row.items,
    }));
  }
}
