import { describe, it, expect } from 'vitest';
import {
  LOW_STOCK_THRESHOLD_GRAMS,
  countNeedingRestock,
  initialStockToQuantity,
  inventoryValue,
  matchesStockFilter,
  restockToQuantity,
  stockStatus,
} from './stock';

describe('stock of a product sold by weight (kept in grams)', () => {
  it('is low up to 2 kg and out at zero', () => {
    expect(stockStatus(0, 'KG')).toBe('out');
    expect(stockStatus(LOW_STOCK_THRESHOLD_GRAMS, 'KG')).toBe('low');
    expect(stockStatus(LOW_STOCK_THRESHOLD_GRAMS + 1, 'KG')).toBe('ok');
    // 5000 g is plenty for a weighed product, but would be 5000 units for the other kind.
    expect(stockStatus(5000, 'KG')).toBe('ok');
    expect(stockStatus(5, 'UN')).toBe('low');
  });

  it('is counted and filtered with its own limit', () => {
    const cheese = { salePrice: 42.9, availableQuantity: 1500, unit: 'KG' as const };
    const rice = { salePrice: 5, availableQuantity: 40 };

    expect(countNeedingRestock([cheese, rice])).toBe(1);
    expect(matchesStockFilter(1500, 'low', 'KG')).toBe(true);
    expect(matchesStockFilter(1500, 'low')).toBe(false);
  });

  it('values the stock as price per kg x kilograms, rounded to the cent per product', () => {
    // 2,5 kg x 42,90 = 107,25 ; 3 un x 5,00 = 15,00
    expect(inventoryValue([{ salePrice: 42.9, availableQuantity: 2500, unit: 'KG' }, { salePrice: 5, availableQuantity: 3 }])).toBe(122.25);
    // 350 g x 42,90 = 15,015 -> 15,02
    expect(inventoryValue([{ salePrice: 42.9, availableQuantity: 350, unit: 'KG' }])).toBe(15.02);
  });
});

describe('what the owner types for a stock', () => {
  it('reads units as a whole number, and nothing as none', () => {
    expect(initialStockToQuantity('12', 'UN')).toBe(12);
    expect(initialStockToQuantity('', 'UN')).toBe(0);
    expect(initialStockToQuantity('1,5', 'UN')).toBeNull();
    expect(initialStockToQuantity('-3', 'UN')).toBeNull();
  });

  it('reads kilograms as grams for a product sold by weight', () => {
    expect(initialStockToQuantity('2,5', 'KG')).toBe(2500);
    expect(initialStockToQuantity('0,350', 'KG')).toBe(350);
    expect(initialStockToQuantity('', 'KG')).toBe(0);
    expect(initialStockToQuantity('0', 'KG')).toBe(0);
    expect(initialStockToQuantity('abc', 'KG')).toBeNull();
  });

  it('needs a positive quantity to restock', () => {
    expect(restockToQuantity('3', 'UN')).toBe(3);
    expect(restockToQuantity('0', 'UN')).toBeNull();
    expect(restockToQuantity('1,5', 'KG')).toBe(1500);
    expect(restockToQuantity('0', 'KG')).toBeNull();
    expect(restockToQuantity('', 'KG')).toBeNull();
  });
});
