import { Money } from '@/shared/domain/money';
import { CustomerInactiveError } from './errors';

export interface CustomerProps {
  id: string;
  merchantId: string;
  name: string;
  phone: string;
  creditLimit: Money;
  active: boolean;
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
      phone: params.phone,
      creditLimit: params.creditLimit ?? Money.zero(),
      active: params.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
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
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  public ensureActive(): void {
    if (!this.active) {
      throw new CustomerInactiveError(this.id);
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
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
