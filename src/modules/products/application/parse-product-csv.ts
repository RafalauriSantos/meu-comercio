// Reads the CSV of a product list (the kind Excel and Google Sheets save): comma, semicolon or tab
// separated, with a header row. Only reading: the rules for each value are in the import use case.

export const MAX_IMPORT_ROWS = 500;

export interface CsvProductRow {
  /** Line of the file (the header is line 1), to point the owner at the exact row. */
  line: number;
  barcode: string;
  name: string;
  salePrice: string;
  initialStock: string;
  /** Optional column: how the product is sold ("un" or "kg"). Empty means by the unit. */
  unit: string;
}

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

const COLUMN_ALIASES: Record<'barcode' | 'name' | 'salePrice' | 'initialStock' | 'unit', string[]> = {
  barcode: ['codigo', 'codigodebarras', 'codigodebarra', 'codbarras', 'barcode', 'ean', 'gtin'],
  name: ['nome', 'produto', 'descricao', 'nomedoproduto', 'name'],
  salePrice: ['preco', 'precodevenda', 'valor', 'valordevenda', 'saleprice'],
  initialStock: ['estoque', 'estoqueinicial', 'quantidade', 'qtd', 'stock'],
  unit: ['unidade', 'un', 'vendidopor', 'tipo', 'medida', 'unit'],
};

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(firstLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Splits the text into records of cells, honoring quotes (a doubled quote is a quote, a quoted cell may hold a newline). */
function splitRecords(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\r') {
      // Handled with the \n that follows; a lone \r also ends a record.
      if (text[i + 1] !== '\n') {
        line += 1;
        endRecord();
      }
    } else if (char === '\n') {
      line += 1;
      endRecord();
    } else {
      cell += char;
    }
  }
  if (cell !== '' || cells.length > 0) endRecord();
  return records;
}

export function parseProductCsv(rawText: string): CsvProductRow[] {
  const text = rawText.replace(/^﻿/, '');
  if (text.trim() === '') {
    throw new ImportFileError('A planilha está vazia.');
  }

  const firstLine = text.split(/\r\n|\n|\r/, 1)[0];
  const records = splitRecords(text, detectDelimiter(firstLine)).filter((record) =>
    record.cells.some((cell) => cell.trim() !== '')
  );

  const header = records[0].cells.map(normalizeHeader);
  const columnIndex = {} as Record<keyof typeof COLUMN_ALIASES, number>;
  for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>) {
    columnIndex[key] = header.findIndex((name) => COLUMN_ALIASES[key].includes(name));
  }

  const missing: string[] = [];
  if (columnIndex.barcode < 0) missing.push('código de barras');
  if (columnIndex.name < 0) missing.push('nome');
  if (columnIndex.salePrice < 0) missing.push('preço');
  if (missing.length > 0) {
    throw new ImportFileError(
      `A primeira linha precisa ter os títulos das colunas. Faltou: ${missing.join(', ')}. Use a planilha-modelo.`
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    throw new ImportFileError('A planilha não tem nenhum produto abaixo dos títulos.');
  }
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `A planilha tem ${dataRecords.length} produtos. O máximo por importação é ${MAX_IMPORT_ROWS}: divida em partes.`
    );
  }

  const cellAt = (cells: string[], index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');
  return dataRecords.map((record) => ({
    line: record.line,
    barcode: cellAt(record.cells, columnIndex.barcode),
    name: cellAt(record.cells, columnIndex.name),
    salePrice: cellAt(record.cells, columnIndex.salePrice),
    initialStock: cellAt(record.cells, columnIndex.initialStock),
    unit: cellAt(record.cells, columnIndex.unit),
  }));
}

/** "R$ 1.234,50", "12,5" and "12.50" all become "1234.50", "12.5" and "12.50"; anything else is returned as is. */
export function normalizePriceText(raw: string): string {
  const text = raw.replace(/R\$/gi, '').replace(/\s/g, '');
  if (text.includes(',')) {
    return text.replace(/\./g, '').replace(',', '.');
  }
  return text;
}
