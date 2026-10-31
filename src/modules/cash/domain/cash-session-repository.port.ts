import { Money } from '@/shared/domain/money';
import { CashSession, CashMovementType } from './cash-session';

export interface CurrentCashSessionSummary {
  id: string;
  merchantId: string;
  openedBy: string;
  openingBalance: Money;
  openedAt: Date;
  expectedCash: Money;
  movementsCount: number;
}

export interface CashSessionRepository {
  findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null>;
  findSessionById(merchantId: string, sessionId: string): Promise<CashSession | null>;
  openSession(session: CashSession): Promise<void>;
  closeSession(merchantId: string, sessionId: string, operatorId: string, closingBalance: Money, closedAt: Date): Promise<void>;
  addMovement(
    merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money,
    saleId?: string | null
  ): Promise<void>;
  getExpectedCash(merchantId: string, sessionId: string): Promise<Money>;
}
