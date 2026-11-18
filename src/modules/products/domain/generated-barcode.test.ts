import { describe, it, expect } from 'vitest';
import { ean13CheckDigit, isValidEan13, isValidBarcode, generateBarcode } from './generated-barcode';

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

// Same cases as the migration 0005 (drizzle/migrations/0005_replace_sem_barcodes.sql and its test), so both rules agree.
describe('isValidBarcode (D-30)', () => {
  it.each([
    ['EAN-13', '7891000100103'],
    ['EAN-13', '4006381333931'],
    ['EAN-8', '12345670'],
    ['UPC-A', '036000291452'],
    ['GTIN-14', '17891000100100'],
    ['generated', '2912345678906'],
    ['weighing scale (prefix 2)', '2000000000909'],
  ])('accepts the valid %s %s', (_kind, code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it('accepts 1000 generated barcodes', () => {
    for (let n = 0; n < 1000; n++) expect(isValidBarcode(generateBarcode())).toBe(true);
  });

  it.each([
    ['wrong EAN-13 check digit', '7891000100104'],
    ['wrong EAN-8 check digit', '12345671'],
    ['wrong UPC-A check digit', '036000291453'],
    ['wrong GTIN-14 check digit', '17891000100101'],
    ['wrong weighing scale check digit', '2000000000900'],
    ['3 digits', '123'],
    ['4 digits', '1001'],
    ['7 digits', '1234567'],
    ['9 digits', '123456789'],
    ['10 digits', '1234567890'],
    ['11 digits', '12345678901'],
    ['15 digits', '789100010010312'],
    ['64 digits', '1'.repeat(64)],
    ['sem- code', 'sem-1'],
    ['SEM- code', 'SEM-32354'],
    ['letters', 'sdfbath'],
    ['letters and numbers', 'ab12cd'],
    ['symbols', 'AB-12/3'],
    ['space in the middle', '1234 5670'],
    ['trailing space', '7891000100103 '],
    ['only spaces', '   '],
    ['empty', ''],
  ])('refuses %s (%j)', (_kind, code) => {
    expect(isValidBarcode(code)).toBe(false);
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
