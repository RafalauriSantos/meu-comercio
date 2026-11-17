import { Money } from '@/shared/domain/money';
import { Customer } from './customer';

/** The only fields an edit can change here. */
export interface CustomerChanges {
  name?: string;
  phone?: string;
  creditLimit?: Money;
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
  search(merchantId: string, query: string): Promise<Customer[]>;
  /**
   * Edits name, phone and/or credit limit in one transaction: locks the row, applies only what changed, bumps updated_at and
   * records CUSTOMER_UPDATED. Nothing changed: returns the customer without writing. Not found: null.
   * Throws CustomerAlreadyExistsError (phone in use) and CustomerChangedError (stale expectedUpdatedAt).
   */
  updateDetails(
    merchantId: string,
    customerId: string,
    changes: CustomerChanges,
    context: CustomerUpdateContext
  ): Promise<Customer | null>;
}
