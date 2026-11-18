import { Money } from '@/shared/domain/money';
import { CreditMovement } from './credit-movement';

export interface DebtSettlementAudit {
  eventType: string;
  actorId: string;
  aggregateType: string;
  aggregateId: string;
  details: Record<string, unknown>;
}

/** What the settlement writes, decided from the debt read under the customer lock. */
export interface DebtSettlementEffects {
  movement: CreditMovement;
  audit: DebtSettlementAudit;
}

export interface DebtSettlementCommit {
  merchantId: string;
  customerId: string;
  cashSessionId: string;
  amount: Money;
  /**
   * Called with the debt read after the customer row is locked (never a value read before it).
   * Throws DebtSettlementExceedsBalanceError to abort; otherwise returns the rows to write.
   */
  decide: (currentDebt: Money) => DebtSettlementEffects;
}

export interface DebtSettlementRepository {
  /**
   * Writes the credit movement, the DEBT_PAYMENT cash entry and the audit, all or nothing.
   * Locks the cash session (FOR SHARE) and then the customer (FOR UPDATE).
   * Throws NoOpenCashSessionError if the session is no longer open and CustomerNotFoundError if the customer is gone.
   */
  commitDebtSettlement(commit: DebtSettlementCommit): Promise<void>;
}
