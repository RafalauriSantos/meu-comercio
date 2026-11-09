import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import { decodeCsvBytes, readSpreadsheetAsCsv, rowsToCsv, UnsupportedSpreadsheetError } from './spreadsheet-to-csv';
import { ImportProductsUseCase } from '@/modules/products/application/import-products.use-case';

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe('decodeCsvBytes', () => {
  it('reads UTF-8, as saved by Google Sheets and "CSV UTF-8" of Excel', () => {
    const utf8 = new TextEncoder().encode('Açúcar;Feijão').buffer as ArrayBuffer;

    expect(decodeCsvBytes(utf8)).toBe('Açúcar;Feijão');
  });

  it('reads the plain "CSV" of Excel in Portuguese (Windows-1252) with the accents right', () => {
    // "Açúcar" in Windows-1252: A, ç = 0xE7, ú = 0xFA, c, a, r
    const windows1252 = bytes(0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72);

    expect(decodeCsvBytes(windows1252)).toBe('Açúcar');
  });
});

describe('rowsToCsv', () => {
  it('writes numbers, empty cells and dates, and quotes what holds the separator or a quote', () => {
    const csv = rowsToCsv([
      ['Código', 'Nome', 'Preço', 'Estoque'],
      [7891000100103, 'Água 1,5L', 3.5, null],
      ['2', 'Pote "grande"; azul', 24.9, 3],
    ]);

    expect(csv).toBe(
      ['Código;Nome;Preço;Estoque', '7891000100103;"Água 1,5L";3.5;', '2;"Pote ""grande""; azul";24.9;3'].join('\r\n')
    );
  });
});

describe('readSpreadsheetAsCsv', () => {
  it('refuses the old .xls format with a clear message', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'produtos.xls');

    await expect(readSpreadsheetAsCsv(file)).rejects.toBeInstanceOf(UnsupportedSpreadsheetError);
    await expect(readSpreadsheetAsCsv(file)).rejects.toThrow(/\.xlsx/);
  });

  it('reads a CSV file as text', async () => {
    const file = new File([new TextEncoder().encode('codigo;nome;preco\n1;Arroz;5')], 'p.csv');

    expect(await readSpreadsheetAsCsv(file)).toBe('codigo;nome;preco\n1;Arroz;5');
  });
});

// A minimal .xlsx: a zip with the five parts a spreadsheet needs, strings written inline.
function minimalXlsx(rows: Array<Array<string | number>>): Buffer {
  const column = (index: number) => String.fromCharCode(65 + index);
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${column(c)}${r + 1}`;
          return typeof value === 'number'
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const files = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Produtos" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
    ),
  };
  return Buffer.from(zipSync(files));
}

describe('an .xlsx through the importer', () => {
  it('reads the sheet and the import rules apply to it as to a CSV', async () => {
    const xlsx = minimalXlsx([
      ['Código de barras', 'Nome', 'Preço', 'Estoque'],
      ['7891000100103', 'Arroz Tipo 1 5kg', 24.9, 12],
      ['7891000200207', 'Feijão Carioca 1kg', 8.5, 30],
      ['7891000300301', 'Sal', 'abc', 1],
    ]);

    const rows = (await readSheet(xlsx)) as Array<Array<string | number>>;
    const csv = rowsToCsv(rows);

    const useCase = new ImportProductsUseCase({
      findExistingBarcodes: async () => new Set(),
      importAll: async () => {},
    });
    const report = await useCase.execute('m1', 'dona', csv, { dryRun: true });

    expect(report.valid).toEqual([
      { line: 2, barcode: '7891000100103', name: 'Arroz Tipo 1 5kg', salePrice: '24.90', unit: 'UN', initialStock: 12 },
      { line: 3, barcode: '7891000200207', name: 'Feijão Carioca 1kg', salePrice: '8.50', unit: 'UN', initialStock: 30 },
    ]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ line: 4 });
  });
});
