import { describe, it, expect } from 'vitest';
import { suggestCashAmounts, centsToInputValue, quickAmountLabel } from './quick-amounts';

describe('suggestCashAmounts', () => {
  it('suggests the next R$ 10 multiple and the next notes above the total', () => {
    expect(suggestCashAmounts(5978)).toEqual([6000, 10000, 20000]);
  });

  it('starts from R$ 10 for small totals', () => {
    expect(suggestCashAmounts(750)).toEqual([1000, 2000, 5000]);
  });

  it('never suggests the exact total or anything below it', () => {
    expect(suggestCashAmounts(10000)).toEqual([20000, 50000]);
    expect(suggestCashAmounts(25000)).toEqual([50000]);
  });

  it('returns nothing for an empty or invalid total', () => {
    expect(suggestCashAmounts(0)).toEqual([]);
    expect(suggestCashAmounts(-100)).toEqual([]);
    expect(suggestCashAmounts(Number.NaN)).toEqual([]);
  });

  it('respects the maximum number of suggestions', () => {
    expect(suggestCashAmounts(5978, 1)).toEqual([6000]);
  });
});

describe('quick amount formatting', () => {
  it('formats cents for the cash input', () => {
    expect(centsToInputValue(6000)).toBe('60.00');
    expect(centsToInputValue(12345)).toBe('123.45');
  });

  it('labels whole reais without decimals', () => {
    expect(quickAmountLabel(6000)).toBe('R$ 60');
    expect(quickAmountLabel(6050)).toBe('R$ 60,50');
  });
});
