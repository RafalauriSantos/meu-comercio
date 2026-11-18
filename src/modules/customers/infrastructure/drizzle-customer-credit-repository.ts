import { eq, and, sql, desc, or, like } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { customerCreditLedger } from './customers.schema';
import { CreditMovement, CreditMovementType } from '../domain/credit-movement';
import {
  CustomerCreditRepository,
  CustomerCreditBalance,
  CreditMetrics,
  CustomerStatementReader,
  StatementRow,
} from '../domain/customer-credit-repository.port';
import { StatementPosition } from '../domain/customer-statement';
import { Money } from '@/shared/domain/money';

interface StatementSqlRow {
  id: string;
  type: string;
  amount: string;
  sale_id: string | null;
  cash_session_id: string | null;
  operator_id: string;
  authorized_by: string | null;
  note: string | null;
  cursor_at: string;
  running_balance: string;
}

export class DrizzleCustomerCreditRepository implements CustomerCreditRepository, CustomerStatementReader {
  async saveMovement(movement: CreditMovement): Promise<void> {
    await db.insert(customerCreditLedger).values({
      id: movement.id,
      merchantId: movement.merchantId,
      customerId: movement.customerId,
      type: movement.type,
      amount: movement.amount.toDecimal(),
      saleId: movement.saleId ?? null,
      cashSessionId: movement.cashSessionId ?? null,
      operatorId: movement.operatorId,
      authorizedBy: movement.authorizedBy ?? null,
      note: movement.note ?? null,
      createdAt: movement.createdAt,
    });
  }

  async getBalance(merchantId: string, customerId: string): Promise<CustomerCreditBalance> {
    const [result] = await db
      .select({
        totalDebits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'DEBIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
        totalCredits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'CREDIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
      })
      .from(customerCreditLedger)
      .where(
        and(
          eq(customerCreditLedger.merchantId, merchantId),
          eq(customerCreditLedger.customerId, customerId)
        )
      );

    const totalDebits = Money.fromDecimal(result?.totalDebits ?? '0');
    const totalCredits = Money.fromDecimal(result?.totalCredits ?? '0');
    const rawDebt = totalDebits.subtract(totalCredits);
    const currentDebt = rawDebt.isNegative() ? Money.zero() : rawDebt;

    return {
      currentDebt,
      totalDebits,
      totalCredits,
    };
  }

  async getMovementsByCustomerId(merchantId: string, customerId: string): Promise<CreditMovement[]> {
    const rows = await db
      .select()
      .from(customerCreditLedger)
      .where(
        and(
          eq(customerCreditLedger.merchantId, merchantId),
          eq(customerCreditLedger.customerId, customerId)
        )
      )
      .orderBy(desc(customerCreditLedger.createdAt));

    return rows.map((row) => this.mapRowToCreditMovement(row));
  }

  async getStatementPage(
    merchantId: string,
    customerId: string,
    page: { limit: number; after?: StatementPosition }
  ): Promise<StatementRow[]> {
    const after = page.after
      ? sql`where (t.created_at, t.id) < (${page.after.createdAt}::timestamptz, ${page.after.id}::uuid)`
      : sql``;
    // The running balance is computed over the whole history (oldest to newest) before the cursor and the limit cut the page.
    // cursor_at keeps the microseconds of created_at, which a JS Date would lose.
    const result = await db.execute(sql`
      select t.* from (
        select
          l.id, l.type, l.amount, l.sale_id, l.cash_session_id, l.operator_id, l.authorized_by, l.note, l.created_at,
          to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at,
          sum(case when l.type = 'DEBIT' then l.amount else -l.amount end)
            over (order by l.created_at asc, l.id asc rows between unbounded preceding and current row) as running_balance
        from customer_credit_ledger l
        where l.merchant_id = ${merchantId} and l.customer_id = ${customerId}
      ) t
      ${after}
      order by t.created_at desc, t.id desc
      limit ${page.limit}
    `);

    return (result.rows as unknown as StatementSqlRow[]).map((row) => {
      const createdAt = new Date(row.cursor_at);
      return {
        movement: new CreditMovement({
          id: row.id,
          merchantId,
          customerId,
          type: row.type as CreditMovementType,
          amount: Money.fromDecimal(row.amount),
          operatorId: row.operator_id,
          authorizedBy: row.authorized_by,
          saleId: row.sale_id,
          cashSessionId: row.cash_session_id,
          note: row.note,
          createdAt,
        }),
        runningBalance: Money.fromDecimal(row.running_balance),
        position: { createdAt: row.cursor_at, id: row.id },
      };
    });
  }

  async findMovementsBySaleId(merchantId: string, saleId: string): Promise<CreditMovement[]> {
    const rows = await db
      .select()
      .from(customerCreditLedger)
      .where(
        and(
          eq(customerCreditLedger.merchantId, merchantId),
          or(
            eq(customerCreditLedger.saleId, saleId),
            like(customerCreditLedger.note, `%${saleId}%`)
          )
        )
      )
      .orderBy(desc(customerCreditLedger.createdAt));

    return rows.map((row) => this.mapRowToCreditMovement(row));
  }

  private mapRowToCreditMovement(row: typeof customerCreditLedger.$inferSelect): CreditMovement {
    return new CreditMovement({
      id: row.id,
      merchantId: row.merchantId,
      customerId: row.customerId,
      type: row.type as CreditMovementType,
      amount: Money.fromDecimal(row.amount),
      operatorId: row.operatorId,
      authorizedBy: row.authorizedBy,
      saleId: row.saleId,
      cashSessionId: row.cashSessionId,
      note: row.note,
      createdAt: row.createdAt,
    });
  }

  async getCreditMetrics(merchantId: string): Promise<CreditMetrics> {
    const rows = await db
      .select({
        customerId: customerCreditLedger.customerId,
        totalDebits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'DEBIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
        totalCredits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'CREDIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
      })
      .from(customerCreditLedger)
      .where(eq(customerCreditLedger.merchantId, merchantId))
      .groupBy(customerCreditLedger.customerId);

    let totalOutstandingCredit = Money.zero();
    let totalSettledCredit = Money.zero();
    let activeDebtorsCount = 0;

    for (const row of rows) {
      const debits = Money.fromDecimal(row.totalDebits);
      const credits = Money.fromDecimal(row.totalCredits);
      const rawDebt = debits.subtract(credits);

      if (rawDebt.isPositive()) {
        totalOutstandingCredit = totalOutstandingCredit.add(rawDebt);
        activeDebtorsCount += 1;
      }

      totalSettledCredit = totalSettledCredit.add(credits);
    }

    return {
      totalOutstandingCredit,
      totalSettledCredit,
      activeDebtorsCount,
    };
  }
}
