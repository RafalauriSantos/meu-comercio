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

export interface ProductImportStore {
  /** The barcodes, among the given ones, that the merchant already has in the catalog. */
  findExistingBarcodes(merchantId: string, barcodes: string[]): Promise<Set<string>>;
  /** Creates every product with its stock, movement and audit trail, or none of them. */
  importAll(merchantId: string, actorId: string, items: ProductImportItem[]): Promise<void>;
}
