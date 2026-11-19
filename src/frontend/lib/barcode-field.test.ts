import { describe, it, expect } from 'vitest';
import { INVALID_BARCODE_MESSAGE } from '@/modules/products/domain/product-errors';
import { BARCODE_INVALID_TEXT, barcodeFieldState } from './barcode-field';

describe('barcodeFieldState', () => {
  it('is empty for nothing or only spaces', () => {
    expect(barcodeFieldState('')).toEqual({ kind: 'empty' });
    expect(barcodeFieldState('   ')).toEqual({ kind: 'empty' });
  });

  it('is short (a neutral warning with the length) for digits below 8', () => {
    expect(barcodeFieldState('123')).toEqual({ kind: 'short', length: 3 });
    expect(barcodeFieldState('1234567')).toEqual({ kind: 'short', length: 7 });
  });

  it('is invalid for letters, a length that is not 8/12/13/14 and a wrong check digit', () => {
    for (const code of ['abc123', '123456789', '12345678901234567', '7891000100104', '12345679', '1234567890123x']) {
      expect(barcodeFieldState(code)).toEqual({ kind: 'invalid' });
    }
  });

  it('is valid with the name of the type by length', () => {
    expect(barcodeFieldState('7891000100103')).toEqual({ kind: 'valid', label: 'EAN-13' });
    expect(barcodeFieldState('96385074')).toEqual({ kind: 'valid', label: 'EAN-8' });
    expect(barcodeFieldState('036000291452')).toEqual({ kind: 'valid', label: 'UPC-A' });
    expect(barcodeFieldState('10012345678902')).toEqual({ kind: 'valid', label: 'GTIN-14' });
  });

  it('ignores spaces anywhere in the text', () => {
    expect(barcodeFieldState(' 789 1000 100103 ')).toEqual({ kind: 'valid', label: 'EAN-13' });
  });

  it('uses the same message as the server', () => {
    expect(BARCODE_INVALID_TEXT).toBe(INVALID_BARCODE_MESSAGE);
  });
});
