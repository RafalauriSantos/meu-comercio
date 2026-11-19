import { describe, it, expect } from 'vitest';
import { generateProductsCsv } from './generate-products-csv';
import { parseProductCsv } from './parse-product-csv';
import { Money } from '@/shared/domain/money';
import type { ProductExportRow } from '../domain/product-export-reader.port';

const row = (extra: Partial<ProductExportRow> = {}): ProductExportRow => ({
  barcode: '7891000100103',
  name: 'Arroz Tipo 1 5kg',
  salePrice: Money.fromDecimal('24.9'),
  unit: 'UN',
  availableQuantity: 12,
  ...extra,
});

const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('generateProductsCsv', () => {
  it('starts with the BOM, uses ; and CRLF, and the five titles', () => {
    const csv = generateProductsCsv([row()], { stockControl: true });

    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines(csv)).toEqual(['Código de barras;Nome;Preço;Estoque;Unidade', '	7891000100103;Arroz Tipo 1 5kg;24,90;12;un', '']);
  });

  it('leaves the Estoque column out when the shop does not control stock', () => {
    const csv = generateProductsCsv([row()], { stockControl: false });

    expect(lines(csv)).toEqual(['Código de barras;Nome;Preço;Unidade', '	7891000100103;Arroz Tipo 1 5kg;24,90;un', '']);
  });

  it('writes weight in kilos with unit kg', () => {
    const csv = generateProductsCsv(
      [
        row({ barcode: '1', name: 'A', unit: 'KG', availableQuantity: 2500 }),
        row({ barcode: '2', name: 'B', unit: 'KG', availableQuantity: 3000 }),
        row({ barcode: '3', name: 'C', unit: 'KG', availableQuantity: 5 }),
        row({ barcode: '4', name: 'D', unit: 'KG', availableQuantity: 0 }),
      ],
      { stockControl: true }
    );

    expect(lines(csv).slice(1, 5).map((l) => l.split(';').slice(3))).toEqual([['2,5', 'kg'], ['3', 'kg'], ['0,005', 'kg'], ['0', 'kg']]);
  });

  it('writes the price with a comma and two places, no thousands separator', () => {
    const csv = generateProductsCsv([row({ salePrice: Money.fromDecimal('1234.5') })], { stockControl: true });

    expect(lines(csv)[1].split(';')[2]).toBe('1234,50');
  });

  it('sorts by name ignoring case, then by barcode', () => {
    const csv = generateProductsCsv(
      [row({ barcode: '3', name: 'banana' }), row({ barcode: '2', name: 'Arroz' }), row({ barcode: '1', name: 'arroz' }), row({ barcode: '4', name: 'Açúcar' })],
      { stockControl: false }
    );

    expect(lines(csv).slice(1, 5).map((l) => l.split(';').slice(0, 2).join('|').replace('	', ''))).toEqual(['4|Açúcar', '1|arroz', '2|Arroz', '3|banana']);
  });

  it('quotes cells with ; quotes or line breaks, doubling the quotes', () => {
    const csv = generateProductsCsv([row({ name: 'Suco "Uva"; 1L\nCaixa' })], { stockControl: false });

    expect(csv).toContain('"Suco ""Uva""; 1L\nCaixa"');
    expect(parseProductCsv(csv)[0].name).toBe('Suco "Uva"; 1L\nCaixa');
  });

  it.each(['=SOMA(A1)', '+1', '-5% promo', '@cmd'])('does not let %s become a formula and reads back the same', (name) => {
    const csv = generateProductsCsv([row({ name })], { stockControl: false });
    const cell = lines(csv)[1].split(';')[1];

    expect(cell).not.toMatch(/^[=+\-@]/);
    expect(parseProductCsv(csv)[0].name).toBe(name);
  });

  it('always puts a tab before the barcode so Excel keeps it as text, and reads back the same', () => {
    const csv = generateProductsCsv([row({ barcode: '04012345678901' }), row({ barcode: '7891000100103' })], { stockControl: false });

    expect(lines(csv).slice(1, 3).map((l) => l.split(';')[0])).toEqual(['\t04012345678901', '\t7891000100103']);
    expect(parseProductCsv(csv).map((r) => r.barcode)).toEqual(['04012345678901', '7891000100103']);
  });
});
