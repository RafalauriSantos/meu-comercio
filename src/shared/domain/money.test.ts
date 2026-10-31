import { describe, it, expect } from 'vitest';
import { Money } from './money';

describe('Money Value Object', () => {
  it('should create Money from cents correctly', () => {
    const money = Money.fromCents(1050);
    expect(money.toCents()).toBe(1050);
    expect(money.toDecimal()).toBe('10.50');
    expect(money.formatBrl()).toBe('R$ 10,50');
  });

  it('should create Money from decimal correctly', () => {
    const money = Money.fromDecimal('45.90');
    expect(money.toCents()).toBe(4590);
    expect(money.toDecimal()).toBe('45.90');
  });

  it('should perform exact addition without floating-point errors', () => {
    // 0.1 + 0.2 in normal JS is 0.30000000000000004
    const m1 = Money.fromDecimal('0.10');
    const m2 = Money.fromDecimal('0.20');
    const sum = m1.add(m2);

    expect(sum.toDecimal()).toBe('0.30');
    expect(sum.toCents()).toBe(30);
  });

  it('should perform exact subtraction', () => {
    const m1 = Money.fromDecimal('50.00');
    const m2 = Money.fromDecimal('12.35');
    const diff = m1.subtract(m2);

    expect(diff.toDecimal()).toBe('37.65');
    expect(diff.toCents()).toBe(3765);
  });

  it('should accurately calculate weight-based prices (grocery scale scenario)', () => {
    // 0.345 kg of cheese at R$ 45.90/kg = R$ 15.8355 -> rounded half-up to R$ 15.84 (1584 cents)
    const pricePerKg = Money.fromDecimal('45.90');
    const weightKg = 0.345;
    const itemTotal = pricePerKg.multiply(weightKg);

    expect(itemTotal.toCents()).toBe(1584);
    expect(itemTotal.toDecimal()).toBe('15.84');
  });

  it('should divide accurately', () => {
    const total = Money.fromDecimal('100.00');
    const installment = total.divide(3);

    expect(installment.toDecimal()).toBe('33.33');
    expect(installment.toCents()).toBe(3333);
  });

  it('should throw on invalid money inputs', () => {
    expect(() => Money.fromDecimal('abc')).toThrowError('Invalid monetary amount: abc');
    expect(() => Money.fromDecimal(NaN)).toThrowError('Amount must be finite: NaN');
    expect(() => Money.fromDecimal(Infinity)).toThrowError('Amount must be finite: Infinity');
    expect(() => Money.fromCents(NaN)).toThrowError('Invalid cents amount: NaN');
  });

  it('should reject operations between different currencies', () => {
    const brl = Money.fromCents(100, 'BRL');
    const usd = Money.fromCents(100, 'USD');

    expect(() => brl.add(usd)).toThrowError('Currency mismatch: BRL !== USD');
    expect(() => brl.subtract(usd)).toThrowError('Currency mismatch: BRL !== USD');
  });

  it('should support comparisons', () => {
    const m10 = Money.fromDecimal('10.00');
    const m20 = Money.fromDecimal('20.00');

    expect(m10.lessThan(m20)).toBe(true);
    expect(m20.greaterThan(m10)).toBe(true);
    expect(m10.equals(Money.fromDecimal('10.00'))).toBe(true);
  });
});
