// Turns the file the owner picks (a CSV from Excel or Google Sheets, or an .xlsx) into the CSV text that
// the import endpoint reads. Everything here runs in the browser; the server only ever sees CSV text.

type Cell = string | number | boolean | Date | null | undefined;

export class UnsupportedSpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSpreadsheetError';
  }
}

/**
 * Text of a CSV file. Google Sheets and "CSV UTF-8" from Excel are UTF-8; the plain "CSV" of Excel in
 * Portuguese is Windows-1252. Valid UTF-8 is read as UTF-8, anything else as Windows-1252, so the accents
 * come out right either way.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function cellToText(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  return String(cell);
}

function quoteIfNeeded(text: string): string {
  return /[";,\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of cells (the sheet as read from an .xlsx) as semicolon separated CSV text. */
export function rowsToCsv(rows: Cell[][]): string {
  return rows
    .map((row) => row.map((cell) => quoteIfNeeded(cellToText(cell).trim())).join(';'))
    .join('\r\n');
}

function isXlsx(file: File): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export async function readSpreadsheetAsCsv(file: File): Promise<string> {
  if (/\.xls$/i.test(file.name)) {
    throw new UnsupportedSpreadsheetError(
      'Esse é o formato antigo do Excel (.xls). Abra no Excel e salve como .xlsx ou como CSV.'
    );
  }

  if (isXlsx(file)) {
    // Loaded only when an .xlsx is picked, and without a Web Worker: a product list is small.
    const { readSheet } = await import('read-excel-file/web-worker');
    const rows = (await readSheet(file)) as Cell[][];
    return rowsToCsv(rows);
  }

  return decodeCsvBytes(await file.arrayBuffer());
}
