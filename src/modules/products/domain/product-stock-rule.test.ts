import { describe, it, expect } from 'vitest';
import { LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD_GRAMS } from '@/frontend/management/stock';
import { RESTOCK_THRESHOLD_UNITS, RESTOCK_THRESHOLD_GRAMS } from './product-stock-rule';

// The server counts "needs restock" with its own copy of the screen limits. They must not drift apart.
describe('restock thresholds', () => {
  it('match the ones the management screen uses', () => {
    expect(RESTOCK_THRESHOLD_UNITS).toBe(LOW_STOCK_THRESHOLD);
    expect(RESTOCK_THRESHOLD_GRAMS).toBe(LOW_STOCK_THRESHOLD_GRAMS);
  });
});
