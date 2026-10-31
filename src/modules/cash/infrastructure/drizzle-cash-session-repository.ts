import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { cashSessions, cashMovements } from './cash.schema';
import { CashSession, CashMovementType } from '../domain/cash-session';
import {
  CashSessionRepository,
  CurrentCashSessionSummary,
} from '../domain/cash-session-repository.port';
import { Money } from '@/shared/domain/money';

export class DrizzleCashSessionRepository implements CashSessionRepository {
  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    const rows = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.merchantId, merchantId),
          eq(cashSessions.status, 'OPEN')
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const expectedCash = await this.getExpectedCash(merchantId, row.id);

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.merchantId, merchantId),
          eq(cashMovements.cashSessionId, row.id)
        )
      );

    return {
      id: row.id,
      merchantId: row.merchantId,
      openedBy: row.openedBy,
      openingBalance: Money.fromDecimal(row.openingBalance),
      openedAt: row.openedAt,
      expectedCash,
      movementsCount: countResult[0]?.count ?? 0,
    };
  }

  async findSessionById(merchantId: string, sessionId: string): Promise<CashSession | null> {
    const rows = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.merchantId, merchantId),
          eq(cashSessions.id, sessionId)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return new CashSession({
      id: row.id,
      merchantId: row.merchantId,
      openedBy: row.openedBy,
      openingBalance: Money.fromDecimal(row.openingBalance),
      openedAt: row.openedAt,
      status: row.status as 'OPEN' | 'CLOSED',
      closedBy: row.closedBy,
      closingBalance: row.closingBalance ? Money.fromDecimal(row.closingBalance) : null,
      closedAt: row.closedAt,
    });
  }

  async openSession(session: CashSession): Promise<void> {
    await db.insert(cashSessions).values({
      id: session.id,
      merchantId: session.merchantId,
      openedBy: session.openedBy,
      openingBalance: session.openingBalance.toDecimal(),
      openedAt: session.openedAt,
      status: 'OPEN',
    });
  }

  async closeSession(
    merchantId: string,
    sessionId: string,
    operatorId: string,
    closingBalance: Money,
    closedAt: Date
  ): Promise<void> {
    await db
      .update(cashSessions)
      .set({
        status: 'CLOSED',
        closedBy: operatorId,
        closingBalance: closingBalance.toDecimal(),
        closedAt,
      })
      .where(
        and(
          eq(cashSessions.merchantId, merchantId),
          eq(cashSessions.id, sessionId)
        )
      );
  }

  async addMovement(
    merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money,
    saleId?: string | null
  ): Promise<void> {
    await db.insert(cashMovements).values({
      merchantId,
      cashSessionId: sessionId,
      movementType,
      amount: amount.toDecimal(),
      saleId: saleId ?? null,
    });
  }

  async getExpectedCash(merchantId: string, sessionId: string): Promise<Money> {
    const movements = await db
      .select({
        movementType: cashMovements.movementType,
        amount: cashMovements.amount,
      })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.merchantId, merchantId),
          eq(cashMovements.cashSessionId, sessionId)
        )
      );

    let total = Money.zero();

    for (const mov of movements) {
      const amount = Money.fromDecimal(mov.amount);
      if (
        mov.movementType === 'OPENING_BALANCE' ||
        mov.movementType === 'SALE_RECEIPT' ||
        mov.movementType === 'CREDIT_PAYMENT' ||
        mov.movementType === 'SUPPLY'
      ) {
        total = total.add(amount);
      } else if (
        mov.movementType === 'SALE_REFUND' ||
        mov.movementType === 'BLEED'
      ) {
        total = total.subtract(amount);
      }
    }

    return total;
  }
}
