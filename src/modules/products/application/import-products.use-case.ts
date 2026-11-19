import { ProductRowSchema } from './create-product.use-case';
import { normalizePriceText, parseProductCsv } from './parse-product-csv';
import { ProductCorrection, ProductImportStore, ProductSnapshot } from '../domain/product-import-store.port';
import { isValidBarcode } from '../domain/generated-barcode';
import { parseKilosToGrams, type ProductUnit } from '@/shared/domain/product-unit';
import { Money } from '@/shared/domain/money';

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

export interface ImportCorrectedPreview {
  line: number;
  barcode: string;
  unit: ProductUnit;
  before: ProductSnapshot;
  after: ProductSnapshot;
  /** The price moves by more than 50 percent, up or down. Only a warning for the owner. */
  priceChangeOver50: boolean;
}

export interface ImportReport {
  /** Products that are new and valid: the ones that are created. */
  valid: ImportRowPreview[];
  /** Products that already exist and have another name or price in the sheet: the ones that are corrected. */
  corrected: ImportCorrectedPreview[];
  /** Products that already exist and are equal to the sheet. Nothing is written for them. */
  unchanged: Array<{ line: number; barcode: string; name: string }>;
  /** Rows of deleted products. They are left as they are. */
  skipped: Array<{ line: number; barcode: string; name: string; reason: string }>;
  /** Rows with a problem. While there is any, nothing is written. */
  errors: Array<{ line: number; message: string }>;
  imported: boolean;
}

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const STOCK_PATTERN = /^\d+$/;
const DELETED_REASON = 'Produto excluído: não é alterado nem recriado.';

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

function toCents(price: string): number {
  return Money.fromDecimal(price).toCents();
}

/** More than 50 percent up or down, in whole cents. From a price of zero, any price counts. */
function changesOver50(before: string, after: string): boolean {
  const from = toCents(before);
  const to = toCents(after);
  return from === 0 ? to > 0 : Math.abs(to - from) * 2 > from;
}

interface RowToCorrect {
  line: number;
  name: string;
  unit: ProductUnit;
  correction: ProductCorrection;
}

export class ImportProductsUseCase {
  constructor(private readonly store: ProductImportStore) {}

  /**
   * Reads the sheet and checks every row. With `dryRun` (the preview) nothing is written. Otherwise the
   * new products are created and the existing ones corrected only when no row has a problem, and all together.
   */
  public async execute(
    merchantId: string,
    actorId: string,
    csv: string,
    options: {
      dryRun: boolean;
      /** Whether the shop controls its stock. Off, the Estoque column is ignored: every product starts at zero. Default: on. */
      stockControl?: boolean;
      /** On: the price of the sheet is ignored for the products that already exist (their name is still corrected). Default: off. */
      onlyNames?: boolean;
    }
  ): Promise<ImportReport> {
    const stockControl = options.stockControl ?? true;
    const onlyNames = options.onlyNames ?? false;
    const rows = parseProductCsv(csv);
    const existing = await this.store.findProductsByBarcodes(
      merchantId,
      rows.map((row) => row.barcode).filter((barcode) => barcode !== '')
    );

    const errors: ImportReport['errors'] = [];
    const valid: ImportRowPreview[] = [];
    let corrected: ImportCorrectedPreview[] = [];
    const unchanged: ImportReport['unchanged'] = [];
    const skipped: ImportReport['skipped'] = [];
    const toCorrect: RowToCorrect[] = [];
    const firstLineOfBarcode = new Map<string, number>();

    const isRepeated = (barcode: string, line: number): boolean => {
      const earlier = firstLineOfBarcode.get(barcode);
      if (earlier !== undefined) {
        errors.push({ line, message: `Código de barras repetido na planilha (já aparece na linha ${earlier}).` });
        return true;
      }
      firstLineOfBarcode.set(barcode, line);
      return false;
    };

    for (const row of rows) {
      const found = existing.get(row.barcode);

      // A deleted product is never touched (D-27), and its row is not even checked.
      if (found && !found.active) {
        if (!isRepeated(row.barcode, row.line)) {
          skipped.push({ line: row.line, barcode: row.barcode, name: row.name, reason: DELETED_REASON });
        }
        continue;
      }

      const price = normalizePriceText(row.salePrice);
      // With only the names corrected, the price of the sheet is not read for a product that exists.
      if (!(found && onlyNames) && !PRICE_PATTERN.test(price)) {
        errors.push({ line: row.line, message: `Preço inválido: "${row.salePrice}". Use um valor como 24,90.` });
        continue;
      }
      const unit = parseUnit(row.unit);
      if (unit === null) {
        errors.push({ line: row.line, message: `Unidade inválida: "${row.unit}". Use un (por unidade) ou kg (por peso).` });
        continue;
      }

      if (found) {
        // The stock of the sheet is ignored here, and so is the check digit of the barcode (old data, D-30).
        const parsed = ProductRowSchema.safeParse({
          barcode: row.barcode,
          name: row.name,
          salePrice: onlyNames ? 0 : price,
          unit: found.unit,
        });
        if (!parsed.success) {
          errors.push({ line: row.line, message: parsed.error.issues[0].message });
          continue;
        }
        const typedUnit = row.unit.trim().toLowerCase();
        if (typedUnit !== '' && unit !== found.unit) {
          errors.push({
            line: row.line,
            message: `A unidade de um produto cadastrado não muda; a planilha diz ${typedUnit} e o produto é vendido por ${found.unit === 'KG' ? 'peso' : 'unidade'}`,
          });
          continue;
        }
        const beforePrice = Money.fromDecimal(found.salePrice).toDecimal();
        const afterPrice = onlyNames ? beforePrice : Money.fromDecimal(price).toDecimal();
        if (toCents(afterPrice) === 0 && toCents(beforePrice) !== 0) {
          errors.push({ line: row.line, message: 'O preço precisa ser maior que zero' });
          continue;
        }
        if (isRepeated(row.barcode, row.line)) continue;

        const name = parsed.data.name;
        if (name === found.name && toCents(afterPrice) === toCents(beforePrice)) {
          unchanged.push({ line: row.line, barcode: row.barcode, name });
          continue;
        }
        corrected.push({
          line: row.line,
          barcode: row.barcode,
          unit: found.unit,
          before: { name: found.name, salePrice: beforePrice },
          after: { name, salePrice: afterPrice },
          priceChangeOver50: changesOver50(beforePrice, afterPrice),
        });
        toCorrect.push({
          line: row.line,
          name,
          unit: found.unit,
          correction: { barcode: row.barcode, name, ...(!onlyNames && { salePrice: afterPrice }) },
        });
        continue;
      }

      // By weight the stock is typed in kilograms (2,5) and kept in grams; by the unit it is a whole number.
      let initialStock = 0;
      if (stockControl && row.initialStock !== '') {
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
      const parsed = ProductRowSchema.safeParse({
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
      if (!isValidBarcode(parsed.data.barcode)) {
        errors.push({
          line: row.line,
          message: `Código de barras inválido: "${parsed.data.barcode}". Use um código de barras de verdade.`,
        });
        continue;
      }
      if (isRepeated(row.barcode, row.line)) continue;
      valid.push({
        line: row.line,
        barcode: parsed.data.barcode,
        name: parsed.data.name,
        salePrice: Number(price).toFixed(2),
        unit: parsed.data.unit,
        initialStock: parsed.data.initialStock,
      });
    }

    const canWrite = !options.dryRun && errors.length === 0 && (valid.length > 0 || toCorrect.length > 0);
    if (canWrite) {
      const outcomes = await this.store.importAll(merchantId, actorId, {
        create: valid.map(({ barcode, name, salePrice, unit, initialStock }) => ({ barcode, name, salePrice, unit, initialStock })),
        correct: toCorrect.map((row) => row.correction),
      });
      // What happened under the lock replaces what the read showed: a product may have changed or been deleted meanwhile.
      const rowOf = new Map(toCorrect.map((row) => [row.correction.barcode, row]));
      corrected = [];
      for (const outcome of outcomes) {
        const row = rowOf.get(outcome.barcode)!;
        if (outcome.outcome === 'corrected') {
          corrected.push({
            line: row.line,
            barcode: outcome.barcode,
            unit: row.unit,
            before: outcome.before,
            after: outcome.after,
            priceChangeOver50: changesOver50(outcome.before.salePrice, outcome.after.salePrice),
          });
        } else if (outcome.outcome === 'unchanged') {
          unchanged.push({ line: row.line, barcode: outcome.barcode, name: row.name });
        } else {
          skipped.push({ line: row.line, barcode: outcome.barcode, name: row.name, reason: DELETED_REASON });
        }
      }
      const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
      unchanged.sort(byLine);
      skipped.sort(byLine);
    }

    return { valid, corrected, unchanged, skipped, errors, imported: canWrite };
  }
}
