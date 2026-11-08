import { describe, it, expect } from 'vitest';
import {
  LOW_STOCK_THRESHOLD,
  countNeedingRestock,
  inventoryValue,
  matchesStockFilter,
  stockStatus,
} from './stock';

const product = (salePrice: number, availableQuantity: number) => ({ salePrice, availableQuantity });

describe('stockStatus', () => {
  it('flags zero and negative quantities as out of stock', () => {
    expect(stockStatus(0)).toBe('out');
    expect(stockStatus(-2)).toBe('out');
  });

  it('flags quantities up to the threshold as low and above it as ok', () => {
    expect(stockStatus(1)).toBe('low');
    expect(stockStatus(LOW_STOCK_THRESHOLD)).toBe('low');
    expect(stockStatus(LOW_STOCK_THRESHOLD + 1)).toBe('ok');
  });
});

describe('countNeedingRestock', () => {
  it('counts low and out of stock products only', () => {
    expect(countNeedingRestock([product(1, 0), product(1, 3), product(1, 5), product(1, 6), product(1, 40)])).toBe(3);
  });

  it('is zero for an empty catalog', () => {
    expect(countNeedingRestock([])).toBe(0);
  });
});

describe('inventoryValue', () => {
  it('sums price times quantity without floating point drift', () => {
    // 0.1 * 3 + 0.2 * 3 would be 0.9000000000000001 with plain floats
    expect(inventoryValue([product(0.1, 3), product(0.2, 3)])).toBe(0.9);
    expect(inventoryValue([product(24.9, 18), product(9.49, 3)])).toBe(476.67);
  });

  it('ignores negative quantities and handles an empty catalog', () => {
    expect(inventoryValue([product(10, -4), product(2, 5)])).toBe(10);
    expect(inventoryValue([])).toBe(0);
  });
});

describe('matchesStockFilter', () => {
  it('matches everything for all, only zero for out and only 1..threshold for low', () => {
    expect(matchesStockFilter(0, 'all')).toBe(true);
    expect(matchesStockFilter(0, 'out')).toBe(true);
    expect(matchesStockFilter(3, 'out')).toBe(false);
    expect(matchesStockFilter(3, 'low')).toBe(true);
    expect(matchesStockFilter(0, 'low')).toBe(false);
    expect(matchesStockFilter(20, 'low')).toBe(false);
  });
});
