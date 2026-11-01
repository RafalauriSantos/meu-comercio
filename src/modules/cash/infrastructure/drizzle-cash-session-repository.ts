import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { cashSessions, cashMovements } from './cash.schema';
import { CashSession, CashMovementType, applyCashMovement } from '../domain/cash-session';
import {
  CashSessionRepository,
  CurrentCashSessionSummary,
} from '../domain/cash-session-repository.port';
import { Money } from '@/shared/domain/money';

export class DrizzleCashSessionRepository implements CashSessionRepository {
  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    const [row] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.merchantId, merchantId),
          eq(cashSessions.status, 'OPEN')
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    const [expectedCash, countResult] = await Promise.all([
      this.getExpectedCash(merchantId, row.id),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cashMovements)
        .where(
          and(
            eq(cashMovements.merchantId, merchantId),
            eq(cashMovements.cashSessionId, row.id)
          )
        ),
    ]);

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
    const [row] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.merchantId, merchantId),
          eq(cashSessions.id, sessionId)
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

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
    saleId?: string | null,
    reason?: string | null,
    operatorId?: string | null
  ): Promise<void> {
    await db.insert(cashMovements).values({
      merchantId,
      cashSessionId: sessionId,
      movementType,
      amount: amount.toDecimal(),
      saleId: saleId ?? null,
      reason: reason ?? null,
      operatorId: operatorId ?? null,
    });
  }

  async getExpectedCash(merchantId: string, sessionId: string): Promise<Money> {
    const [sessionRow, movements] = await Promise.all([
      db
        .select({ openingBalance: cashSessions.openingBalance })
        .from(cashSessions)
        .where(and(eq(cashSessions.merchantId, merchantId), eq(cashSessions.id, sessionId)))
        .limit(1),
      db
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
        ),
    ]);

    const hasOpeningMovement = movements.some(
      (m) => m.movementType === 'OPENING_BALANCE'
    );
    const initialBalance =
      !hasOpeningMovement && sessionRow[0]?.openingBalance
        ? Money.fromDecimal(sessionRow[0].openingBalance)
        : Money.zero();

    return movements.reduce(
      (total, mov) =>
        applyCashMovement(
          total,
          mov.movementType as CashMovementType,
          Money.fromDecimal(mov.amount)
        ),
      initialBalance
    );
  }
}
