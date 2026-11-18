import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { Money } from '@/shared/domain/money';
import { customers, customerCreditLedger } from './customers.schema';
import { cashMovements, cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';
import { CustomerNotFoundError, NoOpenCashSessionError } from '../domain/errors';
import { DebtSettlementCommit, DebtSettlementRepository } from '../domain/debt-settlement-repository.port';

export class DrizzleDebtSettlementRepository implements DebtSettlementRepository {
  /** Lock order from ADR-021: cash session (FOR SHARE), then customer (FOR UPDATE). */
  async commitDebtSettlement(commit: DebtSettlementCommit): Promise<void> {
    const { merchantId, customerId, cashSessionId, amount } = commit;
    await db.transaction(async (tx) => {
      const [session] = await tx
        .select({ status: cashSessions.status })
        .from(cashSessions)
        .where(and(eq(cashSessions.merchantId, merchantId), eq(cashSessions.id, cashSessionId)))
        .for('share');
      if (session?.status !== 'OPEN') {
        throw new NoOpenCashSessionError();
      }

      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.merchantId, merchantId), eq(customers.id, customerId)))
        .for('update');
      if (!customer) {
        throw new CustomerNotFoundError(customerId);
      }

      const [totals] = await tx
        .select({
          totalDebits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'DEBIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
          totalCredits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'CREDIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
        })
        .from(customerCreditLedger)
        .where(and(eq(customerCreditLedger.merchantId, merchantId), eq(customerCreditLedger.customerId, customerId)));
      const rawDebt = Money.fromDecimal(totals?.totalDebits ?? '0').subtract(
        Money.fromDecimal(totals?.totalCredits ?? '0')
      );
      const { movement, audit } = commit.decide(rawDebt.isNegative() ? Money.zero() : rawDebt);

      await tx.insert(cashMovements).values({
        merchantId,
        cashSessionId,
        movementType: 'DEBT_PAYMENT',
        amount: amount.toDecimal(),
      });
      await tx.insert(customerCreditLedger).values({
        id: movement.id,
        merchantId,
        customerId,
        type: movement.type,
        amount: movement.amount.toDecimal(),
        saleId: movement.saleId,
        cashSessionId: movement.cashSessionId,
        operatorId: movement.operatorId,
        authorizedBy: movement.authorizedBy,
        note: movement.note,
        createdAt: movement.createdAt,
      });
      await tx.insert(auditEvents).values(toAuditEventRow(merchantId, audit));
    });
  }
}
