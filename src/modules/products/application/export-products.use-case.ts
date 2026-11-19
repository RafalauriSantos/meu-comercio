import { generateProductsCsv } from './generate-products-csv';
import { MAX_IMPORT_ROWS } from './parse-product-csv';
import type { ProductExportReader } from '../domain/product-export-reader.port';
import { ExportTooLargeError, NoProductsToExportError } from '../domain/product-errors';

const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

export interface ProductsExport {
  csv: string;
  /** "produtos-AAAA-MM-DD.csv", the day in Brasília. */
  filename: string;
}

export class ExportProductsUseCase {
  constructor(private readonly reader: ProductExportReader) {}

  /** Read only. Throws NoProductsToExportError and ExportTooLargeError. */
  public async execute(merchantId: string, options: { stockControl: boolean; now?: Date }): Promise<ProductsExport> {
    const rows = await this.reader.listActive(merchantId);
    if (rows.length === 0) throw new NoProductsToExportError();
    if (rows.length > MAX_IMPORT_ROWS) throw new ExportTooLargeError(rows.length, MAX_IMPORT_ROWS);

    // en-CA writes the date as AAAA-MM-DD.
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA_TIME_ZONE }).format(options.now ?? new Date());
    return { csv: generateProductsCsv(rows, { stockControl: options.stockControl }), filename: `produtos-${day}.csv` };
  }
}
