import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { customerCreditLedger } from './customers.schema';
import { CreditMovement, CreditMovementType } from '../domain/credit-movement';
import {
  CustomerCreditRepository,
  CustomerCreditBalance,
} from '../domain/customer-credit-repository.port';
import { Money } from '@/shared/domain/money';

export class DrizzleCustomerCreditRepository implements CustomerCreditRepository {
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

    return rows.map(
      (row) =>
        new CreditMovement({
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
        })
    );
  }
}
