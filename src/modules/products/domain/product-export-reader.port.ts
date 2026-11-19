import type { Money } from '@/shared/domain/money';
import type { ProductUnit } from '@/shared/domain/product-unit';

export interface ProductExportRow {
  barcode: string;
  name: string;
  /** Per unit, or per kg when the unit is 'KG'. */
  salePrice: Money;
  unit: ProductUnit;
  /** Units, or grams when the unit is 'KG'. A product without a stock row counts as 0. */
  availableQuantity: number;
}

export interface ProductExportReader {
  /** The active products of the merchant (deleted ones, D-27, never come), in no particular order. Read only. */
  listActive(merchantId: string): Promise<ProductExportRow[]>;
}
