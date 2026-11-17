import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// The PDV has no DOM test setup, so the wiring is checked in the source (like the other pdv-*.test.ts).
const source = readScreenSource('pdv');

describe('/pdv barcode reader outside the search field', () => {
  it('listens through the shared hook and sends the scan to the same lookup as the field', () => {
    expect(source).toContain("from '@/frontend/lib/use-barcode-scan'");
    expect(source).toContain('useBarcodeScan(handleScannedCode)');
    expect(source).toMatch(/async function handleBarcodeSubmit[\s\S]*await addProductByBarcode\(code\)/);
    expect(source).toMatch(/function handleScannedCode[\s\S]*void addProductByBarcode\(code\)/);
    expect(source.match(/apiClient\.findProductByBarcode\(/g)).toHaveLength(1);
  });

  it('ignores a scan with any window open and gives the focus back to the field', () => {
    const handler = source.match(/function handleScannedCode[\s\S]*?\r?\n  }\r?\n/)?.[0] ?? '';
    for (const flag of ['isCheckoutOpen', 'isPinModalOpen', 'isCancelSaleOpen', 'isCashOpModalOpen', 'weightProduct', 'printModalData']) {
      expect(handler, flag).toContain(flag);
    }
    expect(handler).toContain('acceptsScan(');
    expect(handler).toContain('barcodeInputRef.current?.focus()');
  });
});
