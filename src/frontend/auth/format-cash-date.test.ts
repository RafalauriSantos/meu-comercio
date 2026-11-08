import { describe, it, expect } from 'vitest';
import { formatCashDate } from './format-cash-date';

describe('formatCashDate', () => {
  it('writes the weekday, the date and the time in Brazilian format', () => {
    const text = formatCashDate(new Date(2026, 10, 8, 13, 20));

    expect(text).toMatch(/^dom\.?,? 08\/11\/2026 · 13:20$/i);
  });
});
