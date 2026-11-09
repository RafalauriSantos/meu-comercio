import { describe, it, expect } from 'vitest';
import { Money } from './money';
import { formatQuantity, isProductUnit, lineSubtotal, parseGrams, parseKilosToGrams } from './product-unit';

describe('lineSubtotal', () => {
  it('is price x quantity for a product sold by the unit', () => {
    expect(lineSubtotal(Money.fromDecimal('25.50'), 2).toDecimal()).toBe('51.00');
    expect(lineSubtotal(Money.fromDecimal('25.50'), 2, 'UN').toDecimal()).toBe('51.00');
  });

  it('is price per kg x grams / 1000 for a product sold by weight', () => {
    expect(lineSubtotal(Money.fromDecimal('42.90'), 1000, 'KG').toDecimal()).toBe('42.90');
    expect(lineSubtotal(Money.fromDecimal('42.90'), 500, 'KG').toDecimal()).toBe('21.45');
    expect(lineSubtotal(Money.fromDecimal('42.90'), 1, 'KG').toDecimal()).toBe('0.04');
  });

  it('rounds the cent half up, on the line', () => {
    // 15,015 and 6,965 and 53,625 all end in exactly a half cent
    expect(lineSubtotal(Money.fromDecimal('42.90'), 350, 'KG').toDecimal()).toBe('15.02');
    expect(lineSubtotal(Money.fromDecimal('19.90'), 350, 'KG').toDecimal()).toBe('6.97');
    expect(lineSubtotal(Money.fromDecimal('42.90'), 1250, 'KG').toDecimal()).toBe('53.63');
  });

  it('gives a line that is already a whole number of cents, so a sum has no hidden fraction', () => {
    const lines = [350, 123, 777, 1].map((grams) => lineSubtotal(Money.fromDecimal('37.77'), grams, 'KG'));
    const total = lines.reduce((acc, line) => acc.add(line), Money.zero());

    expect(total.toCents()).toBe(lines.reduce((acc, line) => acc + line.toCents(), 0));
    for (const line of lines) {
      // Writing the line with two decimals and reading it back changes nothing.
      expect(Money.fromDecimal(line.toDecimal()).equals(line)).toBe(true);
    }
    expect(Money.fromDecimal(total.toDecimal()).equals(total)).toBe(true);
  });
});

describe('formatQuantity', () => {
  it('shows units as they are, and weights in g or kg', () => {
    expect(formatQuantity(3)).toBe('3');
    expect(formatQuantity(350, 'KG')).toBe('350 g');
    expect(formatQuantity(1000, 'KG')).toBe('1 kg');
    expect(formatQuantity(1250, 'KG')).toBe('1,25 kg');
    expect(formatQuantity(0, 'KG')).toBe('0 g');
  });
});

describe('weight parsing', () => {
  it('reads kilograms with a comma or a point, up to three decimals', () => {
    expect(parseKilosToGrams('0,350')).toBe(350);
    expect(parseKilosToGrams('1.25')).toBe(1250);
    expect(parseKilosToGrams('2')).toBe(2000);
  });

  it('refuses what is not a positive weight', () => {
    expect(parseKilosToGrams('0')).toBeNull();
    expect(parseKilosToGrams('0,0004')).toBeNull();
    expect(parseKilosToGrams('abc')).toBeNull();
    expect(parseKilosToGrams('-1')).toBeNull();
    expect(parseGrams('350')).toBe(350);
    expect(parseGrams('0')).toBeNull();
    expect(parseGrams('3,5')).toBeNull();
  });

  it('knows the two units', () => {
    expect(isProductUnit('UN')).toBe(true);
    expect(isProductUnit('KG')).toBe(true);
    expect(isProductUnit('LT')).toBe(false);
    expect(isProductUnit(undefined)).toBe(false);
  });
});
