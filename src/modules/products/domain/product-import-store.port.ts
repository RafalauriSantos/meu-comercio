export interface ProductImportItem {
  barcode: string;
  name: string;
  /** Decimal text with up to two places, e.g. "24.90". */
  /** Per unit, or per kg when the unit is 'KG'. */
  salePrice: string;
  unit: 'UN' | 'KG';
  /** Units, or grams when the unit is 'KG'. */
  initialStock: number;
}

/** What the sheet says about a product that already exists: its name and, unless left alone, its price. */
export interface ProductCorrection {
  barcode: string;
  name: string;
  /** Decimal text, e.g. "24.90". Absent: the price stays as it is. */
  salePrice?: string;
}

export interface ProductSnapshot {
  name: string;
  /** Decimal text with two places, e.g. "24.90". */
  salePrice: string;
}

export interface ExistingProduct extends ProductSnapshot {
  barcode: string;
  unit: 'UN' | 'KG';
  /** False: the product was deleted (D-27). */
  active: boolean;
}

export interface ProductImportBatch {
  create: ProductImportItem[];
  correct: ProductCorrection[];
}

/** What really happened to a correction when it was written, with the product locked. */
export type CorrectionOutcome =
  | { barcode: string; outcome: 'corrected'; before: ProductSnapshot; after: ProductSnapshot }
  | { barcode: string; outcome: 'unchanged' | 'ignored' };

export interface ProductImportStore {
  /** The merchant's products (active or deleted) that have one of the given barcodes, by barcode. */
  findProductsByBarcodes(merchantId: string, barcodes: string[]): Promise<Map<string, ExistingProduct>>;
  /**
   * Creates every new product with its stock, movement and audit trail, and corrects the existing ones, or
   * none of them. A correction is read under the row lock: deleted meanwhile is `ignored`, already equal to
   * the sheet is `unchanged` (no audit event); otherwise the sheet wins and the audit keeps the real "before".
   */
  importAll(merchantId: string, actorId: string, batch: ProductImportBatch): Promise<CorrectionOutcome[]>;
}
