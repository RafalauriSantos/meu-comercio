import { Money } from '@/shared/domain/money';
import { CustomerCreditBlockedError, CustomerInactiveError, InvalidCreditLimitError } from './errors';
import { Phone } from './phone';

const NAME_MAX_LENGTH = 160;
export const CREDIT_LIMIT_MAX_CENTS = 10_000_000; // R$ 100.000,00

export function toValidCreditLimit(limit: Money): Money {
  const cents = limit.toCents();
  if (cents < 0 || cents > CREDIT_LIMIT_MAX_CENTS) throw new InvalidCreditLimitError();
  return Money.fromCents(cents);
}

export interface CustomerProps {
  id: string;
  merchantId: string;
  name: string;
  phone: string;
  creditLimit: Money;
  active: boolean;
  /** D-26: the owner blocked credit sales for this customer. */
  creditBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Customer {
  public readonly id: string;
  public readonly merchantId: string;
  public readonly name: string;
  public readonly phone: string;
  public readonly creditLimit: Money;
  public readonly active: boolean;
  public readonly creditBlocked: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: CustomerProps) {
    const trimmedName = props.name.trim();
    if (!trimmedName) {
      throw new Error('Customer name is required');
    }

    const normalizedPhone = props.phone.trim();
    if (!normalizedPhone) {
      throw new Error('Customer phone is required');
    }

    if (props.creditLimit.isNegative()) {
      throw new Error('Credit limit cannot be negative');
    }

    this.id = props.id;
    this.merchantId = props.merchantId;
    this.name = trimmedName;
    this.phone = normalizedPhone;
    this.creditLimit = props.creditLimit;
    this.active = props.active;
    this.creditBlocked = props.creditBlocked === true;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(params: {
    id?: string;
    merchantId: string;
    name: string;
    phone: string;
    creditLimit?: Money;
    active?: boolean;
    now?: Date;
  }): Customer {
    const now = params.now ?? new Date();
    return new Customer({
      id: params.id ?? crypto.randomUUID(),
      merchantId: params.merchantId,
      name: params.name,
      phone: Phone.create(params.phone).value,
      creditLimit: params.creditLimit ?? Money.zero(),
      active: params.active ?? true,
      creditBlocked: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Rebuilds the customer with a new name, phone, credit limit and/or credit block. Active is not a parameter. A phone that
   * was not sent stays as stored (legacy text is never revalidated); a phone that was sent follows the D-21
   * rule. The limit is rounded to cents and must be from 0 to CREDIT_LIMIT_MAX (D-22); it may be below the debt.
   */
  public withChanges(changes: { name?: string; phone?: string; creditLimit?: Money; creditBlocked?: boolean }): Customer {
    const name = changes.name === undefined ? this.name : changes.name.trim();
    if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
      throw new Error(`Customer name must have 1 to ${NAME_MAX_LENGTH} characters`);
    }
    return new Customer({
      id: this.id,
      merchantId: this.merchantId,
      name,
      phone: changes.phone === undefined ? this.phone : Phone.create(changes.phone).value,
      creditLimit: changes.creditLimit === undefined ? this.creditLimit : toValidCreditLimit(changes.creditLimit),
      active: this.active,
      creditBlocked: changes.creditBlocked === undefined ? this.creditBlocked : changes.creditBlocked,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  /** From and to of the editable fields that differ in `next`. */
  public changesTo(next: Customer): Record<string, { from: string | boolean; to: string | boolean }> {
    const changes: Record<string, { from: string | boolean; to: string | boolean }> = {};
    if (this.name !== next.name) changes.name = { from: this.name, to: next.name };
    if (this.phone !== next.phone) changes.phone = { from: this.phone, to: next.phone };
    if (!this.creditLimit.equals(next.creditLimit)) {
      changes.creditLimit = { from: this.creditLimit.toDecimal(), to: next.creditLimit.toDecimal() };
    }
    if (this.creditBlocked !== next.creditBlocked) {
      changes.creditBlocked = { from: this.creditBlocked, to: next.creditBlocked };
    }
    return changes;
  }

  public calculateAvailableCredit(currentDebt: Money): Money {
    if (currentDebt.isGreaterThan(this.creditLimit)) {
      return Money.zero();
    }
    return this.creditLimit.subtract(currentDebt);
  }

  public wouldExceedCreditLimit(currentDebt: Money, saleAmount: Money): boolean {
    const projectedDebt = currentDebt.add(saleAmount);
    return projectedDebt.isGreaterThan(this.creditLimit);
  }

  public updateCreditLimit(newLimit: Money, now: Date = new Date()): Customer {
    if (newLimit.isNegative()) {
      throw new Error('Credit limit cannot be negative');
    }
    return new Customer({
      id: this.id,
      merchantId: this.merchantId,
      name: this.name,
      phone: this.phone,
      creditLimit: newLimit,
      active: this.active,
      creditBlocked: this.creditBlocked,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  public deactivate(now: Date = new Date()): Customer {
    return new Customer({
      id: this.id,
      merchantId: this.merchantId,
      name: this.name,
      phone: this.phone,
      creditLimit: this.creditLimit,
      active: false,
      creditBlocked: this.creditBlocked,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  public activate(now: Date = new Date()): Customer {
    return new Customer({
      id: this.id,
      merchantId: this.merchantId,
      name: this.name,
      phone: this.phone,
      creditLimit: this.creditLimit,
      active: true,
      creditBlocked: this.creditBlocked,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  public ensureActive(): void {
    if (!this.active) {
      throw new CustomerInactiveError(this.id);
    }
  }

  public ensureCreditNotBlocked(): void {
    if (this.creditBlocked) {
      throw new CustomerCreditBlockedError();
    }
  }

  public toJSON() {
    return {
      id: this.id,
      merchantId: this.merchantId,
      name: this.name,
      phone: this.phone,
      creditLimit: this.creditLimit.toDecimal(),
      active: this.active,
      creditBlocked: this.creditBlocked,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
