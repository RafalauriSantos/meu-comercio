import { describe, it, expect } from 'vitest';
import { ean13CheckDigit, isValidEan13, generateBarcode } from './generated-barcode';

describe('ean13CheckDigit', () => {
  it.each([
    ['400638133393', 1],
    ['590123412345', 7],
    ['978020137962', 4],
    ['291234567890', 6],
  ])('calculates the check digit of %s', (base, digit) => {
    expect(ean13CheckDigit(base)).toBe(digit);
  });
});

describe('isValidEan13', () => {
  it('accepts known valid codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
  });

  it('rejects a wrong check digit, wrong length or non digits', () => {
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339311')).toBe(false);
    expect(isValidEan13('40063813339a1')).toBe(false);
  });
});

describe('generateBarcode', () => {
  it('uses the injected random source for the 10 digits', () => {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    let i = 0;
    const code = generateBarcode(() => digits[i++] / 10);
    expect(code.startsWith('291234567890')).toBe(true);
    expect(code).toBe('2912345678906');
  });

  it('always has 13 digits, starts with 29 and has a valid check digit', () => {
    for (let n = 0; n < 1000; n++) {
      const code = generateBarcode();
      expect(code).toMatch(/^29\d{11}$/);
      expect(isValidEan13(code)).toBe(true);
    }
  });

  it('handles the extreme values of the random source', () => {
    expect(generateBarcode(() => 0)).toMatch(/^290000000000\d$/);
    expect(generateBarcode(() => 0.999999)).toMatch(/^299999999999\d$/);
  });
});
