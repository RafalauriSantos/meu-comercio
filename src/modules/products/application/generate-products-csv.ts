import { GRAMS_PER_KG } from '@/shared/domain/product-unit';
import type { ProductExportRow } from '../domain/product-export-reader.port';

const BOM = '﻿';
const EOL = '\r\n';
const byName = new Intl.Collator('pt-BR', { sensitivity: 'accent' });

// A leading tab makes Excel keep the cell as plain text, and parseProductCsv trims every cell, so the sheet
// read back has the original text (the cycle stays closed). The barcode always gets it: on a double click Excel
// would turn a long code into 7,89E+12 and drop a leading zero, and saving would ruin the code. The name gets
// it only when it starts with = + - @, which Excel would run as a formula.
function textCell(text: string): string {
  return `\t${text}`;
}

function nameCell(text: string): string {
  return /^[=+\-@]/.test(text) ? textCell(text) : text;
}

function quote(cell: string): string {
  return /[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Grams as kilos with a comma and no trailing zeros: 2500 -> "2,5", 3000 -> "3". */
function kilos(grams: number): string {
  const abs = Math.abs(grams);
  const fraction = String(abs % GRAMS_PER_KG).padStart(3, '0').replace(/0+$/, '');
  return `${grams < 0 ? '-' : ''}${Math.floor(abs / GRAMS_PER_KG)}${fraction === '' ? '' : `,${fraction}`}`;
}

/** The sheet of the active products, in the model the import reads (Excel-friendly CSV: BOM, `;`, CRLF). */
export function generateProductsCsv(rows: ProductExportRow[], options: { stockControl: boolean }): string {
  const sorted = [...rows].sort((a, b) => byName.compare(a.name, b.name) || (a.barcode < b.barcode ? -1 : a.barcode > b.barcode ? 1 : 0));
  const header = ['Código de barras', 'Nome', 'Preço', ...(options.stockControl ? ['Estoque'] : []), 'Unidade'];
  const lines = sorted.map((row) => [
    textCell(row.barcode),
    nameCell(row.name),
    row.salePrice.toDecimal().replace('.', ','),
    ...(options.stockControl ? [row.unit === 'KG' ? kilos(row.availableQuantity) : String(row.availableQuantity)] : []),
    row.unit === 'KG' ? 'kg' : 'un',
  ]);
  return BOM + [header, ...lines].map((cells) => cells.map(quote).join(';')).join(EOL) + EOL;
}
