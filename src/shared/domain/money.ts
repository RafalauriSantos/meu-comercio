import Decimal from 'decimal.js';

// Configure Decimal.js to use half-up rounding (standard financial commercial rounding)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export class Money {
  private readonly value: Decimal;
  public readonly currency: string;

  private constructor(value: Decimal, currency = 'BRL') {
    this.value = value;
    this.currency = currency;
  }

  public static zero(currency = 'BRL'): Money {
    return new Money(new Decimal(0), currency);
  }

  public static fromCents(cents: number | bigint, currency = 'BRL'): Money {
    const numericCents = typeof cents === 'bigint' ? Number(cents) : cents;
    if (!Number.isFinite(numericCents)) {
      throw new Error(`Invalid cents amount: ${cents}`);
    }
    const decimal = new Decimal(numericCents).dividedBy(100);
    return new Money(decimal, currency);
  }

  public static fromDecimal(amount: number | string | Decimal, currency = 'BRL'): Money {
    let decimal: Decimal;
    try {
      decimal = new Decimal(amount);
    } catch {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }
    if (!decimal.isFinite()) {
      throw new Error(`Amount must be finite: ${amount}`);
    }
    return new Money(decimal, currency);
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  public multiply(factor: number | string | Decimal): Money {
    const decFactor = new Decimal(factor);
    if (!decFactor.isFinite()) {
      throw new Error(`Multiplication factor must be finite: ${factor}`);
    }
    return new Money(this.value.times(decFactor), this.currency);
  }

  public divide(divisor: number | string | Decimal): Money {
    const decDivisor = new Decimal(divisor);
    if (!decDivisor.isFinite() || decDivisor.isZero()) {
      throw new Error(`Invalid divisor: ${divisor}`);
    }
    return new Money(this.value.dividedBy(decDivisor), this.currency);
  }

  public toCents(): number {
    return this.value.times(100).round().toNumber();
  }

  public toDecimal(): string {
    return this.value.toFixed(2);
  }

  public formatBrl(): string {
    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(this.value.toNumber());
    // Normalizing non-breaking space (U+00A0) to standard space for test stability
    return formatted.replace(/\u00A0/g, ' ');
  }

  public equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  public greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  public isGreaterThan(other: Money): boolean {
    return this.greaterThan(other);
  }

  public greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThanOrEqualTo(other.value);
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    return this.greaterThanOrEqual(other);
  }

  public lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  public isLessThan(other: Money): boolean {
    return this.lessThan(other);
  }

  public lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThanOrEqualTo(other.value);
  }

  public isLessThanOrEqual(other: Money): boolean {
    return this.lessThanOrEqual(other);
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  public isNegative(): boolean {
    return this.value.lessThan(0);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} !== ${other.currency}`);
    }
  }
}
