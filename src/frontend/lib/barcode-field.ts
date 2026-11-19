import { isValidBarcode } from '@/modules/products/domain/generated-barcode';
import { INVALID_BARCODE_MESSAGE } from '@/modules/products/domain/product-errors';

// The rule is the server's (D-30): this only names what the field shows. The scan is never blocked by it.
export const BARCODE_INVALID_TEXT = INVALID_BARCODE_MESSAGE;

export type BarcodeFieldState =
  | { kind: 'empty' }
  | { kind: 'short'; length: number }
  | { kind: 'invalid' }
  | { kind: 'valid'; label: string };

const TYPE_BY_LENGTH: Record<number, string> = { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' };

/** What the barcode field shows for the typed text, with the spaces left out. */
export function barcodeFieldState(text: string): BarcodeFieldState {
  const code = text.replace(/\s/g, '');
  if (code === '') return { kind: 'empty' };
  if (isValidBarcode(code)) return { kind: 'valid', label: TYPE_BY_LENGTH[code.length] };
  if (/^\d+$/.test(code) && code.length < 8) return { kind: 'short', length: code.length };
  return { kind: 'invalid' };
}
