import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { ImportProductsUseCase } from './import-products.use-case';
import { ImportFileError, MAX_IMPORT_ROWS, normalizePriceText, parseProductCsv } from './parse-product-csv';
import {
  CorrectionOutcome,
  ExistingProduct,
  ProductImportBatch,
  ProductImportItem,
  ProductImportStore,
} from '../domain/product-import-store.port';

class FakeStore implements ProductImportStore {
  public products = new Map<string, ExistingProduct>();
  /** What the store answers for a correction at write time. Default: it applies the sheet to what it has. */
  public writeOverride = new Map<string, CorrectionOutcome>();
  public batches: ProductImportBatch[] = [];

  /** The items created, batch by batch (empty when nothing is created). */
  get imported(): ProductImportItem[][] {
    return this.batches.map((batch) => batch.create).filter((items) => items.length > 0);
  }

  addProduct(barcode: string, name: string, salePrice: string, unit: 'UN' | 'KG' = 'UN', active = true): void {
    this.products.set(barcode, { barcode, name, salePrice, unit, active });
  }

  async findProductsByBarcodes(_merchantId: string, barcodes: string[]): Promise<Map<string, ExistingProduct>> {
    const found = new Map<string, ExistingProduct>();
    for (const barcode of barcodes) {
      const product = this.products.get(barcode);
      if (product) found.set(barcode, product);
    }
    return found;
  }

  async importAll(_merchantId: string, _actorId: string, batch: ProductImportBatch): Promise<CorrectionOutcome[]> {
    this.batches.push(batch);
    return batch.correct.map((correction) => {
      const override = this.writeOverride.get(correction.barcode);
      if (override) return override;
      const current = this.products.get(correction.barcode)!;
      const currentPrice = Money.fromDecimal(current.salePrice).toDecimal();
      return {
        barcode: correction.barcode,
        outcome: 'corrected',
        before: { name: current.name, salePrice: currentPrice },
        after: { name: correction.name, salePrice: correction.salePrice ?? currentPrice },
      };
    });
  }
}

describe('parseProductCsv', () => {
  it('reads a semicolon file saved by Excel, with accents in the titles and a BOM', () => {
    const rows = parseProductCsv('﻿Código de barras;Nome;Preço;Estoque\r\n789;Arroz 5kg;24,90;10\r\n790;Feijão;8,5;\r\n');

    expect(rows).toEqual([
      { line: 2, barcode: '789', name: 'Arroz 5kg', salePrice: '24,90', initialStock: '10', unit: '' },
      { line: 3, barcode: '790', name: 'Feijão', salePrice: '8,5', initialStock: '', unit: '' },
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
    const report = await useCase.execute('m1', 'dona', sheet('7891000100103;Arroz;24,90;10'), { dryRun: true });

    expect(report.valid).toEqual([
      { line: 2, barcode: '7891000100103', name: 'Arroz', salePrice: '24.90', unit: 'UN', initialStock: 10 },
    ]);
    expect(report.errors).toEqual([]);
    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
  });

  it('creates all the valid products together when confirmed', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('7891000100103;Arroz;1,50;2', '7891000200209;Feijão;3;'), { dryRun: false });

    expect(report.imported).toBe(true);
    expect(store.imported).toHaveLength(1);
    expect(store.imported[0]).toEqual([
      { barcode: '7891000100103', name: 'Arroz', salePrice: '1.50', unit: 'UN', initialStock: 2 },
      { barcode: '7891000200209', name: 'Feijão', salePrice: '3.00', unit: 'UN', initialStock: 0 },
    ]);
  });

  it('creates nothing when a row has a problem, and names the line', async () => {
    const report = await useCase.execute(
      'm1',
      'dona',
      sheet('7891000100103;Arroz;1,50;2', '7891000200209;Feijão;abc;1', '7891000300305;Sal;2;1,5', '7891000400401;Açúcar;-3;1', '7891000500507;Café;2;1'),
      { dryRun: false }
    );

    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
    expect(report.errors.map((error) => error.line)).toEqual([3, 4, 5]);
    expect(report.errors[0].message).toMatch(/Preço inválido/);
    expect(report.errors[1].message).toMatch(/Estoque inválido/);
    expect(report.valid.map((row) => row.line)).toEqual([2, 6]);
  });

  it('reads a product sold by weight: price per kg and stock in kilograms, kept as grams', async () => {
    const report = await useCase.execute(
      'm1',
      'dona',
      ['codigo;nome;preco;estoque;unidade', '7891000900901;Queijo Mussarela;42,90;2,5;kg', '7891000800805;Arroz;5;3;un', '7891000700709;Mortadela;19,90;;KG'].join('\n'),
      { dryRun: true }
    );

    expect(report.errors).toEqual([]);
    expect(report.valid).toEqual([
      { line: 2, barcode: '7891000900901', name: 'Queijo Mussarela', salePrice: '42.90', unit: 'KG', initialStock: 2500 },
      { line: 3, barcode: '7891000800805', name: 'Arroz', salePrice: '5.00', unit: 'UN', initialStock: 3 },
      { line: 4, barcode: '7891000700709', name: 'Mortadela', salePrice: '19.90', unit: 'KG', initialStock: 0 },
    ]);
  });

  it('flags an unknown unit and a weight stock that is not kilograms', async () => {
    const report = await useCase.execute(
      'm1',
      'dona',
      ['codigo;nome;preco;estoque;unidade', '7891000100103;Queijo;42,90;2;litro', '7891000200209;Presunto;30;abc;kg', '7891000300305;Salame;50;1,2345;kg'].join('\n'),
      { dryRun: true }
    );

    expect(report.errors.map((error) => error.line)).toEqual([2, 3, 4]);
    expect(report.errors[0].message).toMatch(/Unidade inválida/);
    expect(report.errors[1].message).toMatch(/quilos/);
  });

  it('ignores the Estoque column when the shop does not control its stock: every product starts at zero', async () => {
    const report = await useCase.execute(
      'm1',
      'dona',
      ['codigo;nome;preco;estoque;unidade', '7891000100103;Arroz;5;40;un', '7891000200209;Queijo;42,90;2,5;kg', '7891000300305;Sal;3;abc;un'].join('\n'),
      { dryRun: true, stockControl: false }
    );

    // Not even a stock that would be an error (abc) is looked at.
    expect(report.errors).toEqual([]);
    expect(report.valid.map((row) => [row.barcode, row.unit, row.initialStock])).toEqual([
      ['7891000100103', 'UN', 0],
      ['7891000200209', 'KG', 0],
      ['7891000300305', 'UN', 0],
    ]);
  });

  it('still reads the Estoque column when the shop controls its stock, and by default', async () => {
    const sheet = ['codigo;nome;preco;estoque', '7891000100103;Arroz;5;40'].join('\n');

    const explicit = await useCase.execute('m1', 'dona', sheet, { dryRun: true, stockControl: true });
    const byDefault = await useCase.execute('m1', 'dona', sheet, { dryRun: true });

    expect(explicit.valid[0].initialStock).toBe(40);
    expect(byDefault.valid[0].initialStock).toBe(40);
  });

  it('flags a short name and an empty barcode', async () => {
    const report = await useCase.execute('m1', 'dona', sheet(';Arroz;5;1', '7891000700709;A;5;1'), { dryRun: true });

    expect(report.errors.map((error) => error.line)).toEqual([2, 3]);
  });

  it('flags a barcode repeated inside the sheet, pointing at the first line', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('7891000100103;Arroz um;1;1', '7891000100103;Arroz dois;2;1'), { dryRun: true });

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].line).toBe(3);
    expect(report.errors[0].message).toContain('linha 2');
  });

  it('refuses a row with an invalid barcode, with the line and the code, and creates nothing (D-30)', async () => {
    const lines = ['123', '1001', 'sem-1', 'abc', '7891000100104', '12345671', '036000291453', '17891000100101', '123456789'];
    const report = await useCase.execute(
      'm1',
      'dona',
      sheet(...lines.map((code, i) => `${code};Produto ${i};5;1`), '7891000200209;Valido;5;1'),
      { dryRun: false }
    );

    expect(report.imported).toBe(false);
    expect(store.imported).toEqual([]);
    expect(report.errors).toEqual(
      lines.map((code, i) => ({ line: i + 2, message: `Código de barras inválido: "${code}". Use um código de barras de verdade.` }))
    );
    expect(report.valid.map((row) => row.line)).toEqual([11]);
  });

  it('shows the invalid row as an error in the preview too, next to the valid ones (D-30)', async () => {
    const report = await useCase.execute('m1', 'dona', sheet('7891000100103;Arroz;5;1', '123;Feijão;5;1'), { dryRun: true });

    expect(report.valid.map((row) => row.line)).toEqual([2]);
    expect(report.errors).toEqual([{ line: 3, message: 'Código de barras inválido: "123". Use um código de barras de verdade.' }]);
  });

  it('accepts EAN-13, EAN-8, UPC-A and GTIN-14 with the right check digit (D-30)', async () => {
    const codes = ['7891000100103', '12345670', '036000291452', '17891000100100', '2912345678906'];
    const report = await useCase.execute('m1', 'dona', sheet(...codes.map((code, i) => `${code};Produto ${i};5;1`)), { dryRun: false });

    expect(report.errors).toEqual([]);
    expect(report.imported).toBe(true);
    expect(store.imported[0].map((item) => item.barcode)).toEqual(codes);
  });

  it('keeps an empty barcode as the required-field error, not the invalid one (D-30)', async () => {
    const report = await useCase.execute('m1', 'dona', sheet(';Arroz;5;1'), { dryRun: true });

    expect(report.errors).toEqual([{ line: 2, message: 'Código de barras é obrigatório' }]);
  });

  describe('products that already exist (D-31)', () => {
    const ARROZ = '7891000100103';
    const FEIJAO = '7891000200209';
    const SAL = '7891000300305';
    const withUnit = (...lines: string[]) => ['codigo;nome;preco;estoque;unidade', ...lines].join('\n');

    it('has the limit at 1000 rows', () => {
      expect(MAX_IMPORT_ROWS).toBe(1000);
    });

    it('corrects the name and the price of an active product, with before and after, and writes it on confirm (13, 14)', async () => {
      store.addProduct(ARROZ, 'arroz', '24.9000');
      const csv = sheet(`${ARROZ};  Arroz Tipo 1 5kg ;25,50;99`);

      const preview = await useCase.execute('m1', 'dona', csv, { dryRun: true });

      expect(preview.errors).toEqual([]);
      expect(preview.valid).toEqual([]);
      expect(preview.corrected).toEqual([
        {
          line: 2,
          barcode: ARROZ,
          unit: 'UN',
          before: { name: 'arroz', salePrice: '24.90' },
          after: { name: 'Arroz Tipo 1 5kg', salePrice: '25.50' },
          priceChangeOver50: false,
        },
      ]);
      expect(preview.imported).toBe(false);
      expect(store.batches).toEqual([]);

      const confirmed = await useCase.execute('m1', 'dona', csv, { dryRun: false });

      expect(confirmed.imported).toBe(true);
      expect(confirmed.corrected).toEqual(preview.corrected);
      expect(store.batches).toEqual([{ create: [], correct: [{ barcode: ARROZ, name: 'Arroz Tipo 1 5kg', salePrice: '25.50' }] }]);
    });

    it('counts a row equal to the register as unchanged, comparing the price in cents and the name case-sensitively (15)', async () => {
      store.addProduct(ARROZ, 'Arroz', '24.9000');
      store.addProduct(FEIJAO, 'Feijão', '8.5000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ}; Arroz ;24,9;5`, `${FEIJAO};feijão;8,50;5`), { dryRun: false });

      expect(report.unchanged).toEqual([{ line: 2, barcode: ARROZ, name: 'Arroz' }]);
      expect(report.corrected.map((row) => row.barcode)).toEqual([FEIJAO]);
    });

    it('writes nothing, and reports no import, when every row is unchanged (9)', async () => {
      store.addProduct(ARROZ, 'Arroz', '24.9000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;24,90;5`), { dryRun: false });

      expect(report.unchanged).toHaveLength(1);
      expect(report.imported).toBe(false);
      expect(store.batches).toEqual([]);
    });

    it('refuses a name that is empty, too short or too long, with the same message as the register (16)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');
      store.addProduct(FEIJAO, 'Feijão', '5.0000');
      store.addProduct(SAL, 'Sal', '5.0000');

      const report = await useCase.execute(
        'm1',
        'dona',
        sheet(`${ARROZ};;5;1`, `${FEIJAO};A;5;1`, `${SAL};${'x'.repeat(161)};5;1`),
        { dryRun: false }
      );

      expect(report.errors.map((error) => error.line)).toEqual([2, 3, 4]);
      expect(report.errors[0].message).toBe('Nome deve ter no mínimo 2 caracteres');
      expect(report.errors[2].message).toMatch(/160/);
      expect(store.batches).toEqual([]);
    });

    it('refuses an unreadable or negative price with the current message (17)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');
      store.addProduct(FEIJAO, 'Feijão', '5.0000');
      store.addProduct(SAL, 'Sal', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;abc;1`, `${FEIJAO};Feijão;1,2,3;1`, `${SAL};Sal;-3;1`), { dryRun: true });

      expect(report.errors.map((error) => error.line)).toEqual([2, 3, 4]);
      expect(report.errors.every((error) => error.message.startsWith('Preço inválido'))).toBe(true);
    });

    it('accepts a zero price only when the product is already at zero (18)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');
      store.addProduct(FEIJAO, 'Feijão', '0.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;0,00;1`, `${FEIJAO};Feijão;0,00;1`), { dryRun: true });

      expect(report.errors).toEqual([{ line: 2, message: 'O preço precisa ser maior que zero' }]);
      expect(report.unchanged.map((row) => row.barcode)).toEqual([FEIJAO]);
    });

    it('ignores the stock of an existing product, even a stock that would be invalid (19)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');
      store.addProduct(FEIJAO, 'Feijão', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;5;999`, `${FEIJAO};Feijão;5;abc`), { dryRun: false });

      expect(report.errors).toEqual([]);
      expect(report.unchanged).toHaveLength(2);
      expect(store.batches).toEqual([]);
    });

    it('refuses a filled unit that differs from the registered one, and does not compare a blank unit (20)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000', 'UN');
      store.addProduct(FEIJAO, 'Queijo', '40.0000', 'KG');
      store.addProduct(SAL, 'Sal', '3.0000', 'UN');

      const report = await useCase.execute(
        'm1',
        'dona',
        withUnit(`${ARROZ};Arroz;5;1;kg`, `${FEIJAO};Queijo;40;1;un`, `${SAL};Sal;3;1;`),
        { dryRun: true }
      );

      expect(report.errors).toEqual([
        { line: 2, message: 'A unidade de um produto cadastrado não muda; a planilha diz kg e o produto é vendido por unidade' },
        { line: 3, message: 'A unidade de um produto cadastrado não muda; a planilha diz un e o produto é vendido por peso' },
      ]);
      expect(report.unchanged.map((row) => row.line)).toEqual([4]);
    });

    it('matches an existing product by an old invalid barcode and corrects it; an invalid new one still fails (21)', async () => {
      store.addProduct('SEM-1', 'Velho', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet('SEM-1;Novo nome;5;1', '123;Outro;5;1'), { dryRun: true });

      expect(report.corrected.map((row) => row.barcode)).toEqual(['SEM-1']);
      expect(report.errors).toEqual([{ line: 3, message: 'Código de barras inválido: "123". Use um código de barras de verdade.' }]);
    });

    it('still creates a code that does not exist, and counts it as created (23)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz Novo;6;1`, `${FEIJAO};Feijão;3;4`), { dryRun: false });

      expect(report.valid.map((row) => row.barcode)).toEqual([FEIJAO]);
      expect(report.corrected.map((row) => row.barcode)).toEqual([ARROZ]);
      expect(store.batches).toHaveLength(1);
      expect(store.batches[0].create.map((item) => [item.barcode, item.initialStock])).toEqual([[FEIJAO, 4]]);
      expect(store.batches[0].correct.map((item) => item.barcode)).toEqual([ARROZ]);
    });

    it('ignores a deleted product without error and never writes it, not even a bad row for it (24, 31)', async () => {
      store.addProduct(ARROZ, 'Arroz velho', '5.0000', 'UN', false);

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;abc;1`, `${FEIJAO};Feijão;3;1`), { dryRun: false });

      expect(report.errors).toEqual([]);
      expect(report.skipped).toEqual([
        { line: 2, barcode: ARROZ, name: 'Arroz', reason: 'Produto excluído: não é alterado nem recriado.' },
      ]);
      expect(report.valid.map((row) => row.barcode)).toEqual([FEIJAO]);
      expect(store.batches[0].create.map((item) => item.barcode)).toEqual([FEIJAO]);
      expect(store.batches[0].correct).toEqual([]);
    });

    it('refuses a repeated barcode also when it belongs to an existing product, and writes nothing (25, 26)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz um;6;1`, `${ARROZ};Arroz dois;7;1`, `${FEIJAO};Feijão;3;1`), { dryRun: false });

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toMatchObject({ line: 3 });
      expect(report.errors[0].message).toContain('linha 2');
      expect(report.imported).toBe(false);
      expect(store.batches).toEqual([]);
    });

    it('writes nothing, neither creations nor corrections, when any row has an error (26)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz Novo;6;1`, `${FEIJAO};Feijão;abc;1`), { dryRun: false });

      expect(report.imported).toBe(false);
      expect(store.batches).toEqual([]);
    });

    it('flags a price change over 50 percent, up or down, and not exactly 50 (priceChangeOver50)', async () => {
      const codes = [ARROZ, FEIJAO, SAL, '7891000400401', '7891000500507'];
      ['10.0000', '10.0000', '10.0000', '10.0000', '0.0000'].forEach((price, i) => store.addProduct(codes[i], `A${i}`, price));

      const report = await useCase.execute(
        'm1',
        'dona',
        sheet(...['15,01', '15', '4,99', '5', '1'].map((price, i) => `${codes[i]};A${i}x;${price};1`)),
        { dryRun: true }
      );

      expect(report.corrected.map((row) => row.priceChangeOver50)).toEqual([true, false, true, false, true]);
    });

    it('with onlyNames, ignores the price of the existing ones, even a bad one, but still corrects the name', async () => {
      store.addProduct(ARROZ, 'arroz', '24.9000');
      store.addProduct(FEIJAO, 'Feijão', '8.5000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;99;1`, `${FEIJAO};Feijão;abc;1`), { dryRun: false, onlyNames: true });

      expect(report.errors).toEqual([]);
      expect(report.corrected).toEqual([
        {
          line: 2,
          barcode: ARROZ,
          unit: 'UN',
          before: { name: 'arroz', salePrice: '24.90' },
          after: { name: 'Arroz', salePrice: '24.90' },
          priceChangeOver50: false,
        },
      ]);
      expect(report.unchanged.map((row) => row.barcode)).toEqual([FEIJAO]);
      expect(store.batches[0].correct).toEqual([{ barcode: ARROZ, name: 'Arroz' }]);
    });

    it('with onlyNames, still demands a valid price on the new rows', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz;5;1`, `${FEIJAO};Feijão;abc;1`), { dryRun: true, onlyNames: true });

      expect(report.errors).toEqual([{ line: 3, message: expect.stringMatching(/Preço inválido/) }]);
    });

    it('reports what the store really did at write time: a product that changed or was deleted meanwhile (39, 40, 41)', async () => {
      store.addProduct(ARROZ, 'Arroz', '5.0000');
      store.addProduct(FEIJAO, 'Feijão', '5.0000');
      store.addProduct(SAL, 'Sal', '5.0000');
      store.writeOverride.set(ARROZ, {
        barcode: ARROZ,
        outcome: 'corrected',
        before: { name: 'Arroz mudado', salePrice: '7.00' },
        after: { name: 'Arroz Novo', salePrice: '6.00' },
      });
      store.writeOverride.set(FEIJAO, { barcode: FEIJAO, outcome: 'ignored' });
      store.writeOverride.set(SAL, { barcode: SAL, outcome: 'unchanged' });

      const report = await useCase.execute('m1', 'dona', sheet(`${ARROZ};Arroz Novo;6;1`, `${FEIJAO};Feijão novo;6;1`, `${SAL};Sal novo;6;1`), { dryRun: false });

      expect(report.corrected).toEqual([
        {
          line: 2,
          barcode: ARROZ,
          unit: 'UN',
          before: { name: 'Arroz mudado', salePrice: '7.00' },
          after: { name: 'Arroz Novo', salePrice: '6.00' },
          priceChangeOver50: false,
        },
      ]);
      expect(report.skipped).toEqual([{ line: 3, barcode: FEIJAO, name: 'Feijão novo', reason: 'Produto excluído: não é alterado nem recriado.' }]);
      expect(report.unchanged).toEqual([{ line: 4, barcode: SAL, name: 'Sal novo' }]);
    });
  });
});
