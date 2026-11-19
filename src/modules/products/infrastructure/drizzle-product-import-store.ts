import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { products } from './products.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';
import { CorrectionOutcome, ExistingProduct, ProductImportBatch, ProductImportStore, ProductSnapshot } from '../domain/product-import-store.port';
import { Money } from '@/shared/domain/money';
import { isProductUnit } from '@/shared/domain/product-unit';

export type ProductImportDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

const STOCK_REASON = 'Estoque inicial no cadastro do produto';

export class DrizzleProductImportStore<TSchema extends Record<string, unknown>> implements ProductImportStore {
  constructor(private readonly database: ProductImportDatabase<TSchema>) {}

  async findProductsByBarcodes(merchantId: string, barcodes: string[]): Promise<Map<string, ExistingProduct>> {
    if (barcodes.length === 0) return new Map();
    const rows = await this.database
      .select()
      .from(products)
      .where(and(eq(products.merchantId, merchantId), inArray(products.barcode, barcodes)));
    return new Map(
      rows.map((row) => [
        row.barcode,
        {
          barcode: row.barcode,
          name: row.name,
          salePrice: Money.fromDecimal(row.salePrice).toDecimal(),
          unit: isProductUnit(row.unit) ? row.unit : 'UN',
          active: row.active,
        },
      ])
    );
  }

  async importAll(merchantId: string, actorId: string, { create: items, correct }: ProductImportBatch): Promise<CorrectionOutcome[]> {
    if (items.length === 0 && correct.length === 0) return [];
    const now = new Date();
    const created = items.map((item) => ({ ...item, id: randomUUID() }));

    // One transaction: a failure in any step (a barcode created in the meantime, say) leaves nothing behind.
    return this.database.transaction(async (tx) => {
      // Corrections first: the rows are locked in the same order (by barcode) by every import, so two at once only wait.
      const outcomes: CorrectionOutcome[] = [];
      if (correct.length > 0) {
        const locked = await tx
          .select()
          .from(products)
          .where(and(eq(products.merchantId, merchantId), inArray(products.barcode, correct.map((c) => c.barcode))))
          .orderBy(products.barcode)
          .for('update');
        const byBarcode = new Map(locked.map((row) => [row.barcode, row]));

        const written: Array<{ id: string; after: ProductSnapshot; changes: Record<string, { from: string; to: string }> }> = [];
        for (const { barcode, name, salePrice } of correct) {
          const current = byBarcode.get(barcode);
          if (!current?.active) {
            outcomes.push({ barcode, outcome: 'ignored' });
            continue;
          }
          const before = { name: current.name, salePrice: Money.fromDecimal(current.salePrice).toDecimal() };
          // A zero price in the sheet is never written over a price above zero (D-20).
          const price = salePrice !== undefined && Money.fromDecimal(salePrice).isPositive() ? Money.fromDecimal(salePrice).toDecimal() : before.salePrice;
          const after = { name, salePrice: price };
          const changes: Record<string, { from: string; to: string }> = {};
          if (after.name !== before.name) changes.name = { from: before.name, to: after.name };
          if (after.salePrice !== before.salePrice) changes.salePrice = { from: before.salePrice, to: after.salePrice };
          if (Object.keys(changes).length === 0) {
            outcomes.push({ barcode, outcome: 'unchanged' });
            continue;
          }
          written.push({ id: current.id, after, changes });
          outcomes.push({ barcode, outcome: 'corrected', before, after });
        }

        if (written.length > 0) {
          // One statement for all of them (a round trip each would be too slow for a thousand products).
          // updated_at is strictly greater than the previous value, in whole milliseconds, as in the D-20 edit.
          const values = written.map(({ id, after }) => sql`(${id}::uuid, ${after.name}::text, ${after.salePrice}::numeric)`);
          const updated = (await tx.execute(sql`
            UPDATE products AS p
            SET name = v.name,
                sale_price = v.sale_price,
                updated_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', p.updated_at) + interval '1 millisecond')
            FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, name, sale_price)
            WHERE p.id = v.id AND p.merchant_id = ${merchantId}
            RETURNING p.id
          `)) as unknown as { rows: unknown[] };
          // Rows are locked, so every one must be updated; otherwise undo everything.
          if (updated.rows.length !== written.length) {
            throw new Error(`Import updated ${updated.rows.length} products, expected ${written.length}.`);
          }
          await tx.insert(auditEvents).values(
            written.map(({ id, changes }) =>
              toAuditEventRow(merchantId, {
                eventType: 'PRODUCT_UPDATED',
                actorId,
                aggregateType: 'PRODUCT',
                aggregateId: id,
                details: { changes, source: 'import' },
              })
            )
          );
        }
      }

      if (created.length === 0) return outcomes;

      await tx.insert(products).values(
        created.map((item) => ({
          id: item.id,
          merchantId,
          barcode: item.barcode,
          name: item.name,
          salePrice: item.salePrice,
          unit: item.unit,
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
              unit: item.unit,
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
      return outcomes;
    });
  }
}
