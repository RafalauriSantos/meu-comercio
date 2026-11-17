import { describe, it, expect } from 'vitest';
import { Product } from './product';
import { Money } from '@/shared/domain/money';

function sample(unit: 'UN' | 'KG' = 'UN'): Product {
  return Product.create('m1', '1001', 'Arroz', Money.fromDecimal('24.90'), 'p1', unit);
}

describe('Product.withChanges', () => {
  it('changes only the fields sent and keeps the rest', () => {
    const product = sample('KG');

    const changed = product.withChanges({ name: '  Arroz Tio João  ' });

    expect(changed.name).toBe('Arroz Tio João');
    expect(changed.barcode).toBe('1001');
    expect(changed.salePrice.toDecimal()).toBe(product.salePrice.toDecimal());
    expect(changed.id).toBe('p1');
    expect(changed.merchantId).toBe('m1');
    expect(changed.unit).toBe('KG');
    expect(changed.active).toBe(true);
    expect(changed.createdAt).toBe(product.createdAt);
  });

  it('changes the price through Money and the barcode trimmed', () => {
    const changed = sample().withChanges({ salePrice: Money.fromDecimal('12.50'), barcode: ' 2002 ' });

    expect(changed.salePrice.toDecimal()).toBe(Money.fromDecimal('12.50').toDecimal());
    expect(changed.barcode).toBe('2002');
  });

  it('does not change the original product', () => {
    const product = sample();
    product.withChanges({ name: 'Outro nome' });
    expect(product.name).toBe('Arroz');
  });

  it('refuses a zero or negative price', () => {
    expect(() => sample().withChanges({ salePrice: Money.fromDecimal('0') })).toThrow('maior que zero');
    expect(() => sample().withChanges({ salePrice: Money.fromDecimal('-1') })).toThrow();
  });

  it('validates name and barcode like the constructor', () => {
    expect(() => sample().withChanges({ name: 'A' })).toThrow('Nome do produto');
    expect(() => sample().withChanges({ barcode: '   ' })).toThrow('Código de barras');
  });

  it('does not accept unit or active (the type rejects them)', () => {
    // @ts-expect-error unit is not an editable field
    sample().withChanges({ unit: 'KG' });
    // @ts-expect-error active is not an editable field
    sample().withChanges({ active: false });
  });
});

describe('Product.changesTo', () => {
  it('lists from and to of only the fields that changed, the price as decimal text', () => {
    const before = sample();
    const after = before.withChanges({ name: 'Arroz 5 kg', salePrice: Money.fromDecimal('26.5') });

    expect(before.changesTo(after)).toEqual({
      name: { from: 'Arroz', to: 'Arroz 5 kg' },
      salePrice: { from: Money.fromDecimal('24.90').toDecimal(), to: Money.fromDecimal('26.5').toDecimal() },
    });
  });

  it('is empty when nothing changed, even for the same price written differently', () => {
    const before = sample();
    expect(before.changesTo(before.withChanges({ salePrice: Money.fromDecimal('24.9') }))).toEqual({});
  });
});
