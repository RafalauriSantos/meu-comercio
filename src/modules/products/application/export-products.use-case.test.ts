import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import { decodeCsvBytes } from '@/frontend/management/spreadsheet-to-csv';
import { ExportProductsUseCase } from './export-products.use-case';
import { ImportProductsUseCase } from './import-products.use-case';
import { ExportTooLargeError, NoProductsToExportError } from '../domain/product-errors';
import type { ProductExportReader, ProductExportRow } from '../domain/product-export-reader.port';
import type { ExistingProduct, ProductImportBatch, ProductImportStore } from '../domain/product-import-store.port';

const product = (n: number, extra: Partial<ProductExportRow> = {}): ProductExportRow => ({
  barcode: String(7891000000000 + n),
  name: `Produto ${n}`,
  salePrice: Money.fromDecimal('10.5'),
  unit: 'UN',
  availableQuantity: 3,
  ...extra,
});

const readerOf = (rows: ProductExportRow[]): ProductExportReader => ({ listActive: async () => rows });

describe('ExportProductsUseCase', () => {
  it('returns the CSV and a file name with the day in Brasília', async () => {
    // 01:30 UTC on the 20th is still the 19th at 22:30 in Brasília.
    const result = await new ExportProductsUseCase(readerOf([product(1)])).execute('m', {
      stockControl: true,
      now: new Date('2026-11-20T01:30:00Z'),
    });

    expect(result.filename).toBe('produtos-2026-11-19.csv');
    expect(result.csv).toContain('	7891000000001;Produto 1;10,50;3;un');
  });

  it('refuses an empty catalog', async () => {
    await expect(new ExportProductsUseCase(readerOf([])).execute('m', { stockControl: true })).rejects.toThrow(NoProductsToExportError);
  });

  it('refuses more than 1000 products and says how many there are', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => product(i));
    const run = new ExportProductsUseCase(readerOf(rows)).execute('m', { stockControl: true });

    await expect(run).rejects.toThrow(ExportTooLargeError);
    await expect(run).rejects.toThrow('A planilha exporta até 1.000 produtos e a loja tem 1.001. Fale com o suporte.');
  });

  it('accepts exactly 1000 products', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => product(i));

    await expect(new ExportProductsUseCase(readerOf(rows)).execute('m', { stockControl: true })).resolves.toBeDefined();
  });

  it('exports a file that the import reads back as 0 created, 0 corrected, N unchanged', async () => {
    const rows = [
      product(1, { name: '=SOMA(A1)' }),
      product(2, { name: '-5% Promo', barcode: '04012345678901' }),
      product(3, { name: 'Suco "Uva"; 1L', salePrice: Money.fromDecimal('1234.5') }),
      product(4, { name: 'Feijão Carioca', unit: 'KG', availableQuantity: 2500, salePrice: Money.fromDecimal('0') }),
      product(5, { name: '@usuario' }),
    ];
    const existing = new Map<string, ExistingProduct>(
      rows.map((row) => [row.barcode, { barcode: row.barcode, name: row.name, salePrice: row.salePrice.toDecimal(), unit: row.unit, active: true }])
    );
    const batches: ProductImportBatch[] = [];
    const store: ProductImportStore = {
      findProductsByBarcodes: async () => existing,
      importAll: async (_m, _a, batch) => {
        batches.push(batch);
        return [];
      },
    };

    const { csv } = await new ExportProductsUseCase(readerOf(rows)).execute('m', { stockControl: true });
    // The browser reads the file as bytes before it sends the text.
    const text = decodeCsvBytes(new TextEncoder().encode(csv).buffer as ArrayBuffer);
    const report = await new ImportProductsUseCase(store).execute('m', 'dona', text, { dryRun: false });

    expect(report.errors).toEqual([]);
    expect(report.valid).toHaveLength(0);
    expect(report.corrected).toHaveLength(0);
    expect(report.skipped).toHaveLength(0);
    expect(report.unchanged).toHaveLength(5);
    expect(batches).toEqual([]);
  });
});
