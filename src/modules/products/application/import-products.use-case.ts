import { CreateProductSchema } from './create-product.use-case';
import { normalizePriceText, parseProductCsv } from './parse-product-csv';
import { ProductImportItem, ProductImportStore } from '../domain/product-import-store.port';
import { parseKilosToGrams, type ProductUnit } from '@/shared/domain/product-unit';

export interface ImportRowPreview {
  line: number;
  barcode: string;
  name: string;
  /** Per unit, or per kg when the unit is 'KG'. */
  salePrice: string;
  unit: ProductUnit;
  /** Units, or grams when the unit is 'KG'. */
  initialStock: number;
}

export interface ImportReport {
  /** Products that are new and valid: the ones that are created. */
  valid: ImportRowPreview[];
  /** Rows whose barcode is already in the catalog. They are left as they are. */
  skipped: Array<{ line: number; barcode: string; name: string }>;
  /** Rows with a problem. While there is any, nothing is created. */
  errors: Array<{ line: number; message: string }>;
  imported: boolean;
}

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const STOCK_PATTERN = /^\d+$/;

const UNIT_WORDS: Record<string, ProductUnit> = {
  un: 'UN',
  und: 'UN',
  unid: 'UN',
  unidade: 'UN',
  kg: 'KG',
  kilo: 'KG',
  quilo: 'KG',
  quilos: 'KG',
  peso: 'KG',
};

function parseUnit(text: string): ProductUnit | null {
  const key = text.trim().toLowerCase();
  if (key === '') return 'UN';
  return UNIT_WORDS[key] ?? null;
}

export class ImportProductsUseCase {
  constructor(private readonly store: ProductImportStore) {}

  /**
   * Reads the sheet and checks every row. With `dryRun` (the preview) nothing is written. Otherwise the
   * products are created only when no row has a problem, and all together.
   */
  public async execute(
    merchantId: string,
    actorId: string,
    csv: string,
    options: { dryRun: boolean }
  ): Promise<ImportReport> {
    const rows = parseProductCsv(csv);

    const errors: ImportReport['errors'] = [];
    const candidates: ImportRowPreview[] = [];
    const firstLineOfBarcode = new Map<string, number>();

    for (const row of rows) {
      const price = normalizePriceText(row.salePrice);
      if (!PRICE_PATTERN.test(price)) {
        errors.push({ line: row.line, message: `Preço inválido: "${row.salePrice}". Use um valor como 24,90.` });
        continue;
      }
      const unit = parseUnit(row.unit);
      if (unit === null) {
        errors.push({ line: row.line, message: `Unidade inválida: "${row.unit}". Use un (por unidade) ou kg (por peso).` });
        continue;
      }
      // By weight the stock is typed in kilograms (2,5) and kept in grams; by the unit it is a whole number.
      let initialStock = 0;
      if (row.initialStock !== '') {
        if (unit === 'KG') {
          const grams = Number(row.initialStock.replace(',', '.')) === 0 ? 0 : parseKilosToGrams(row.initialStock);
          if (grams === null) {
            errors.push({ line: row.line, message: `Estoque inválido: "${row.initialStock}". Use quilos, como 2,5.` });
            continue;
          }
          initialStock = grams;
        } else if (STOCK_PATTERN.test(row.initialStock)) {
          initialStock = Number(row.initialStock);
        } else {
          errors.push({ line: row.line, message: `Estoque inválido: "${row.initialStock}". Use um número inteiro.` });
          continue;
        }
      }
      const parsed = CreateProductSchema.safeParse({
        barcode: row.barcode,
        name: row.name,
        salePrice: price,
        unit,
        initialStock,
      });
      if (!parsed.success) {
        errors.push({ line: row.line, message: parsed.error.issues[0].message });
        continue;
      }
      const earlier = firstLineOfBarcode.get(parsed.data.barcode);
      if (earlier !== undefined) {
        errors.push({
          line: row.line,
          message: `Código de barras repetido na planilha (já aparece na linha ${earlier}).`,
        });
        continue;
      }
      firstLineOfBarcode.set(parsed.data.barcode, row.line);
      candidates.push({
        line: row.line,
        barcode: parsed.data.barcode,
        name: parsed.data.name,
        salePrice: Number(price).toFixed(2),
        unit: parsed.data.unit,
        initialStock: parsed.data.initialStock,
      });
    }

    const existing = await this.store.findExistingBarcodes(
      merchantId,
      candidates.map((candidate) => candidate.barcode)
    );
    const valid = candidates.filter((candidate) => !existing.has(candidate.barcode));
    const skipped = candidates
      .filter((candidate) => existing.has(candidate.barcode))
      .map(({ line, barcode, name }) => ({ line, barcode, name }));

    const canWrite = !options.dryRun && errors.length === 0 && valid.length > 0;
    if (canWrite) {
      const items: ProductImportItem[] = valid.map(({ barcode, name, salePrice, unit, initialStock }) => ({
        barcode,
        name,
        salePrice,
        unit,
        initialStock,
      }));
      await this.store.importAll(merchantId, actorId, items);
    }

    return { valid, skipped, errors, imported: canWrite };
  }
}
