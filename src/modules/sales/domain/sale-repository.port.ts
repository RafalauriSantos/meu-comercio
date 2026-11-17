import { Sale } from './sale';
import { Money } from '@/shared/domain/money';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';

export interface StockDeduction {
  productId: string;
  quantity: number;
}

export interface AuditEntry {
  eventType: string;
  actorId: string;
  aggregateType: string;
  aggregateId: string;
  details: Record<string, unknown>;
}

export interface CreditDebitCommit {
  customerId: string;
  movement: CreditMovement;
  /**
   * Called with the customer row and the balance read under the customer lock (never values read before it);
   * throws to abort the commit. Checks the credit block (D-26) and the limit.
   */
  ensureAllowed: (locked: LockedCustomerCredit, currentDebt: Money) => void | Promise<void>;
}

/** The customer fields the credit sale depends on, as read after SELECT ... FOR UPDATE. */
export interface LockedCustomerCredit {
  creditBlocked: boolean;
  creditLimit: Money;
}

export interface CashReceiptCommit {
  cashSessionId: string;
  amount: Money;
}

export interface SaleCommit {
  sale: Sale;
  actorId: string;
  stockDeductions: StockDeduction[];
  creditDebit?: CreditDebitCommit;
  cashReceipt?: CashReceiptCommit;
  audits: AuditEntry[];
}

export interface StockReturn {
  productId: string;
  quantity: number;
  reason: string;
}

export interface CashRefundCommit {
  cashSessionId: string;
  amount: Money;
}

export interface CreditRefundCommit {
  customerId: string;
  movement: CreditMovement;
}

export interface CancellationCommit {
  /** The sale already cancelled in memory (`sale.cancel()` was called). */
  sale: Sale;
  actorId: string;
  stockReturns: StockReturn[];
  cashRefund?: CashRefundCommit;
  creditRefund?: CreditRefundCommit;
  audits: AuditEntry[];
}

export interface SaleRepository {
  save(sale: Sale): Promise<void>;
  /** Persists the sale together with its stock, credit and audit effects, all or nothing. */
  commitSale(commit: SaleCommit): Promise<void>;
  /**
   * Cancels the sale together with its stock, cash, credit and audit effects, all or nothing.
   * Throws SaleAlreadyCancelledError if the locked sale is no longer CONFIRMED and
   * CashSessionNotOpenError if the refund session is no longer open.
   */
  commitCancellation(commit: CancellationCommit): Promise<void>;
  findById(merchantId: string, id: string): Promise<Sale | null>;
  findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null>;
}
