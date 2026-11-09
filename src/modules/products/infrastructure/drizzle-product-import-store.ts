import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { products } from './products.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';
import { ProductImportItem, ProductImportStore } from '../domain/product-import-store.port';

export type ProductImportDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

const STOCK_REASON = 'Estoque inicial no cadastro do produto';

export class DrizzleProductImportStore<TSchema extends Record<string, unknown>> implements ProductImportStore {
  constructor(private readonly database: ProductImportDatabase<TSchema>) {}

  async findExistingBarcodes(merchantId: string, barcodes: string[]): Promise<Set<string>> {
    if (barcodes.length === 0) return new Set();
    const rows = await this.database
      .select({ barcode: products.barcode })
      .from(products)
      .where(and(eq(products.merchantId, merchantId), inArray(products.barcode, barcodes)));
    return new Set(rows.map((row) => row.barcode));
  }

  async importAll(merchantId: string, actorId: string, items: ProductImportItem[]): Promise<void> {
    if (items.length === 0) return;
    const now = new Date();
    const created = items.map((item) => ({ ...item, id: randomUUID() }));

    // One transaction: a failure in any step (a barcode created in the meantime, say) leaves nothing behind.
    await this.database.transaction(async (tx) => {
      await tx.insert(products).values(
        created.map((item) => ({
          id: item.id,
          merchantId,
          barcode: item.barcode,
          name: item.name,
          salePrice: item.salePrice,
          active: true,
          createdAt: now,
          updatedAt: now,
        }))
      );

      await tx.insert(inventoryItems).values(
        created.map((item) => ({
          merchantId,
          productId: item.id,
          availableQuantity: item.initialStock,
          updatedAt: now,
        }))
      );

      const withStock = created.filter((item) => item.initialStock > 0);
      if (withStock.length > 0) {
        await tx.insert(inventoryMovements).values(
          withStock.map((item) => ({
            merchantId,
            productId: item.id,
            movementType: 'RESTOCK',
            quantity: item.initialStock,
            reason: STOCK_REASON,
            actorId,
          }))
        );
      }

      await tx.insert(auditEvents).values([
        ...created.map((item) =>
          toAuditEventRow(merchantId, {
            eventType: 'PRODUCT_CREATED',
            actorId,
            aggregateType: 'PRODUCT',
            aggregateId: item.id,
            details: {
              barcode: item.barcode,
              name: item.name,
              salePrice: item.salePrice,
              initialStock: item.initialStock,
              source: 'import',
            },
          })
        ),
        ...withStock.map((item) =>
          toAuditEventRow(merchantId, {
            eventType: 'INVENTORY_RESTOCKED',
            actorId,
            aggregateType: 'INVENTORY_ITEM',
            aggregateId: item.id,
            details: { quantity: item.initialStock, newQuantity: item.initialStock, reason: STOCK_REASON },
          })
        ),
      ]);
    });
  }
}
