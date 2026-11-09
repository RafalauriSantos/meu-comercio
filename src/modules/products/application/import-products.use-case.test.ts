import { describe, it, expect, beforeEach } from 'vitest';
import { ImportProductsUseCase } from './import-products.use-case';
import { ImportFileError, MAX_IMPORT_ROWS, normalizePriceText, parseProductCsv } from './parse-product-csv';
import { ProductImportItem, ProductImportStore } from '../domain/product-import-store.port';

class FakeStore implements ProductImportStore {
  public existing = new Set<string>();
  public imported: ProductImportItem[][] = [];

  async findExistingBarcodes(_merchantId: string, barcodes: string[]): Promise<Set<string>> {
    return new Set(barcodes.filter((barcode) => this.existing.has(barcode)));
  }

  async importAll(_merchantId: string, _actorId: string, items: ProductImportItem[]): Promise<void> {
    this.imported.push(items);
  }
}

describe('parseProductCsv', () => {
  it('reads a semicolon file saved by Excel, with accents in the titles and a BOM', () => {
    const rows = parseProductCsv('﻿Código de barras;Nome;Preço;Estoque\r\n789;Arroz 5kg;24,90;10\r\n790;Feijão;8,5;\r\n');

    expect(rows).toEqual([
      { line: 2, barcode: '789', name: 'Arroz 5kg', salePrice: '24,90', initialStock: '10' },
      { line: 3, barcode: '790', name: 'Feijão', salePrice: '8,5', initialStock: '' },
    ]);
  });

  it('reads a comma file, quoted cells with the separator and a doubled quote', () => {
    const rows = parseProductCsv('codigo,nome,preco\n1,"Sal, grosso",3.20\n2,"Pote ""grande""",9\n');

    expect(rows.map((row) => row.name)).toEqual(['Sal, grosso', 'Pote "grande"']);
  });

  it('skips blank lines and keeps the real line numbers', () => {
    const rows = parseProductCsv('codigo;nome;preco\n\n1;A;1\n\n2;B;2');

    expect(rows.map((row) => row.line)).toEqual([3, 5]);
  });

  it('asks for the titles of the columns when they are missing', () => {
    expect(() => parseProductCsv('789;Arroz;24,90\n')).toThrow(ImportFileError);
    expect(() => parseProductCsv('codigo;nome\n1;A\n')).toThrow(/preço/);
  });

  it('refuses an empty sheet, a sheet with only titles and a sheet that is too long', () => {
    expect(() => parseProductCsv('   \n')).toThrow(/vazia/);
    expect(() => parseProductCsv('codigo;nome;preco\n')).toThrow(/nenhum produto/);
    const long = ['codigo;nome;preco', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `${i};P${i};1`)].join('\n');
    expect(() => parseProductCsv(long)).toThrow(/máximo/);
  });
});

describe('normalizePriceText', () => {
  it('understands the Brazilian and the plain way of writing a price', () => {
    expect(normalizePriceText('R$ 1.234,50')).toBe('1234.50');
    expect(normalizePriceText('24,9')).toBe('24.9');
    expect(normalizePriceText('24.90')).toBe('24.90');
  });
});

describe('ImportProductsUseCase', () => {
  let store: FakeStore;
  let useCase: ImportProductsUseCase;

  beforeEach(() => {
    store = new FakeStore();
    useCase = new ImportProductsUseCase(store);
  });

  const sheet = (...lines: string[]) => ['codigo;nome;preco;estoque', ...lines].join('\n');

  it('previews without writing anything', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('789;Arroz;24,90;10'), { dryRun: true });

    expect(report.valid).toEqual([
      { line: 2, barcode: '789', name: 'Arroz', salePrice: '24.90', initialStock: 10 },
    ]);
    expect(report.errors).toEqual([]);
    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
  });

  it('creates all the valid products together when confirmed', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('1;Arroz;1,50;2', '2;Feijão;3;'), { dryRun: false });

    expect(report.imported).toBe(true);
    expect(store.imported).toHaveLength(1);
    expect(store.imported[0]).toEqual([
      { barcode: '1', name: 'Arroz', salePrice: '1.50', initialStock: 2 },
      { barcode: '2', name: 'Feijão', salePrice: '3.00', initialStock: 0 },
    ]);
  });

  it('creates nothing when a row has a problem, and names the line', async () => {
    const report = await useCase.execute(
      'm1',
      'dona',
      sheet('1;Arroz;1,50;2', '2;Feijão;abc;1', '3;Sal;2;1,5', '4;Açúcar;-3;1', '5;Café;2;1'),
      { dryRun: false }
    );

    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
    expect(report.errors.map((error) => error.line)).toEqual([3, 4, 5]);
    expect(report.errors[0].message).toMatch(/Preço inválido/);
    expect(report.errors[1].message).toMatch(/Estoque inválido/);
    expect(report.valid.map((row) => row.line)).toEqual([2, 6]);
  });

  it('flags a short name and an empty barcode', async () => {
    const report = await useCase.execute('m1', 'dona', sheet(';Arroz;5;1', '7;A;5;1'), { dryRun: true });

    expect(report.errors.map((error) => error.line)).toEqual([2, 3]);
  });

  it('flags a barcode repeated inside the sheet, pointing at the first line', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('1;Arroz um;1;1', '1;Arroz dois;2;1'), { dryRun: true });

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].line).toBe(3);
    expect(report.errors[0].message).toContain('linha 2');
  });

  it('leaves the products that already exist as they are and creates the new ones', async () => {
    store.existing.add('1');

    const report = await useCase.execute('m1', 'dona', sheet('1;Arroz novo nome;99;50', '2;Feijão;3;1'), { dryRun: false });

    expect(report.skipped).toEqual([{ line: 2, barcode: '1', name: 'Arroz novo nome' }]);
    expect(store.imported[0].map((item) => item.barcode)).toEqual(['2']);
    expect(report.imported).toBe(true);
  });

  it('does not report an import when everything in the sheet already exists', async () => {
    store.existing.add('1');

    const report = await useCase.execute('m1', 'dona', sheet('1;Arroz;1;1'), { dryRun: false });

    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
  });
});
