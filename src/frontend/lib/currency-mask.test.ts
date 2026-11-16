import { describe, it, expect } from 'vitest';
import { maskCurrencyDigits } from './currency-mask';

describe('maskCurrencyDigits', () => {
  it('places the comma by itself as digits are typed', () => {
    expect(maskCurrencyDigits('5')).toBe('0,05');
    expect(maskCurrencyDigits('125')).toBe('1,25');
    expect(maskCurrencyDigits('1000')).toBe('10,00');
  });

  it('returns empty when nothing is left (erasing)', () => {
    expect(maskCurrencyDigits('')).toBe('');
    expect(maskCurrencyDigits('abc')).toBe('');
    expect(maskCurrencyDigits('0')).toBe('');
    expect(maskCurrencyDigits('0,00')).toBe('');
  });

  it('considers only the digits, so typed separators still work', () => {
    expect(maskCurrencyDigits('1,25')).toBe('1,25');
    expect(maskCurrencyDigits('1.25')).toBe('1,25');
    expect(maskCurrencyDigits('R$ 1a2b5')).toBe('1,25');
  });

  it('drops leading zeros', () => {
    expect(maskCurrencyDigits('0001')).toBe('0,01');
  });

  it('cuts at 9 digits (max 9999999,99)', () => {
    expect(maskCurrencyDigits('12345678901')).toBe('1234567,89');
    expect(maskCurrencyDigits('999999999')).toBe('9999999,99');
  });
});
