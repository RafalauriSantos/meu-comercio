import { Money } from '@/shared/domain/money';
import { Customer } from './customer';

/** The only fields an edit can change here. */
export interface CustomerChanges {
  name?: string;
  phone?: string;
  creditLimit?: Money;
  /** D-26: block or unblock credit sales. */
  creditBlocked?: boolean;
  /** D-27: false excludes (deactivates) the customer, only with zero debt; true restores. */
  active?: boolean;
}

export interface CustomerUpdateContext {
  actorId: string;
  /** When given and different from the stored updated_at, the edit is refused (CustomerChangedError). */
  expectedUpdatedAt?: Date;
}

export interface CustomerRepository {
  save(customer: Customer): Promise<void>;
  findById(merchantId: string, customerId: string): Promise<Customer | null>;
  findByPhone(merchantId: string, phone: string): Promise<Customer | null>;
  findAllActive(merchantId: string): Promise<Customer[]>;
  /** The excluded (deactivated) customers, for the owner (D-27). */
  findAllInactive(merchantId: string): Promise<Customer[]>;
  /** Cashier search: active customers only (D-27). */
  search(merchantId: string, query: string): Promise<Customer[]>;
  /**
   * Edits name, phone, credit limit and/or credit block in one transaction: locks the row, applies only what changed, bumps updated_at and
   * records CUSTOMER_UPDATED. Nothing changed: returns the customer without writing. Not found: null.
   * Throws CustomerAlreadyExistsError (phone in use), CustomerChangedError (stale expectedUpdatedAt) and, when
   * deactivating, CustomerHasDebtError (the debt is read under the row lock).
   */
  updateDetails(
    merchantId: string,
    customerId: string,
    changes: CustomerChanges,
    context: CustomerUpdateContext
  ): Promise<Customer | null>;
}
