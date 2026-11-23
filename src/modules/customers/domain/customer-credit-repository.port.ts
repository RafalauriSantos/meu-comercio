import { Money } from '@/shared/domain/money';
import { CreditMovement } from './credit-movement';
import { StatementPosition } from './customer-statement';

export interface CustomerCreditBalance {
  currentDebt: Money;
  totalDebits: Money;
  totalCredits: Money;
}

export interface CreditMetrics {
  totalOutstandingCredit: Money;
  totalSettledCredit: Money;
  activeDebtorsCount: number;
}

/** One statement line as stored: the movement, the raw running balance up to it, and its exact position for the cursor. */
export interface StatementRow {
  movement: CreditMovement;
  /** Debits minus credits up to this movement (inclusive), over the whole history. Can be negative. */
  runningBalance: Money;
  position: StatementPosition;
}

export interface CustomerCreditRepository {
  saveMovement(movement: CreditMovement): Promise<void>;
  getBalance(merchantId: string, customerId: string): Promise<CustomerCreditBalance>;
  getMovementsByCustomerId(merchantId: string, customerId: string): Promise<CreditMovement[]>;
  getCreditMetrics?(merchantId: string): Promise<CreditMetrics>;
  findMovementsBySaleId?(merchantId: string, saleId: string): Promise<CreditMovement[]>;
}

export interface CustomerCreditBalanceOf extends CustomerCreditBalance {
  customerId: string;
}

/** Read-only: the balance of every customer of the merchant with ledger movements, in one query. Customers without movements are absent. */
export interface CustomerBalancesReader {
  getBalances(merchantId: string): Promise<CustomerCreditBalanceOf[]>;
}

/** D-28: read-only statement of the credit ledger. */
export interface CustomerStatementReader {
  /** Newest first (createdAt, then id), strictly after `after` when given, at most `limit` rows. */
  getStatementPage(
    merchantId: string,
    customerId: string,
    page: { limit: number; after?: StatementPosition }
  ): Promise<StatementRow[]>;
}
