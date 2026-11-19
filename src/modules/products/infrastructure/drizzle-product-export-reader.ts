import { and, eq, sql } from 'drizzle-orm';
import { products } from './products.schema';
import type { ProductImportDatabase } from './drizzle-product-import-store';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import type { ProductExportReader, ProductExportRow } from '../domain/product-export-reader.port';
import { Money } from '@/shared/domain/money';
import { isProductUnit } from '@/shared/domain/product-unit';

export class DrizzleProductExportReader<TSchema extends Record<string, unknown>> implements ProductExportReader {
  constructor(private readonly database: ProductImportDatabase<TSchema>) {}

  async listActive(merchantId: string): Promise<ProductExportRow[]> {
    const rows = await this.database
      .select({
        barcode: products.barcode,
        name: products.name,
        salePrice: products.salePrice,
        unit: products.unit,
        availableQuantity: sql<number>`coalesce(${inventoryItems.availableQuantity}, 0)`.mapWith(Number),
      })
      .from(products)
      .leftJoin(inventoryItems, and(eq(inventoryItems.merchantId, products.merchantId), eq(inventoryItems.productId, products.id)))
      .where(and(eq(products.merchantId, merchantId), eq(products.active, true)));
    return rows.map((row) => ({
      barcode: row.barcode,
      name: row.name,
      salePrice: Money.fromDecimal(row.salePrice),
      unit: isProductUnit(row.unit) ? row.unit : 'UN',
      availableQuantity: row.availableQuantity,
    }));
  }
}
