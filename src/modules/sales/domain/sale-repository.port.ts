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
  /** Called with the balance read under the customer lock; throws to abort the commit. */
  ensureWithinLimit: (currentDebt: Money) => void | Promise<void>;
}

export interface SaleCommit {
  sale: Sale;
  actorId: string;
  stockDeductions: StockDeduction[];
  creditDebit?: CreditDebitCommit;
  audits: AuditEntry[];
}

export interface SaleRepository {
  save(sale: Sale): Promise<void>;
  /** Persists the sale together with its stock, credit and audit effects, all or nothing. */
  commitSale(commit: SaleCommit): Promise<void>;
  findById(merchantId: string, id: string): Promise<Sale | null>;
  findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null>;
}
