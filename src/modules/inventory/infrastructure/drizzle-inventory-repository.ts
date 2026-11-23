import { eq, and, sql, ExtractTablesWithRelations } from 'drizzle-orm';
import { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { db } from '@/shared/infrastructure/db/connection';
import * as schema from '@/shared/infrastructure/db/schema';
import { inventoryItems, inventoryMovements } from './inventory.schema';
import { InventoryItem } from '../domain/inventory-item';
import { InventoryRepository, InventoryMovementType } from '../domain/inventory-repository.port';

export type InventoryDatabase = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export class DrizzleInventoryRepository implements InventoryRepository {
  constructor(private readonly database: InventoryDatabase = db) {}

  async findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null> {
    const rows = await this.database
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.merchantId, merchantId),
          eq(inventoryItems.productId, productId)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return new InventoryItem({
      merchantId: row.merchantId,
      productId: row.productId,
      availableQuantity: row.availableQuantity,
      updatedAt: row.updatedAt,
    });
  }

  async save(item: InventoryItem): Promise<void> {
    await this.database
      .insert(inventoryItems)
      .values({
        merchantId: item.merchantId,
        productId: item.productId,
        availableQuantity: item.availableQuantity,
        updatedAt: item.updatedAt,
      })
      .onConflictDoUpdate({
        target: [inventoryItems.merchantId, inventoryItems.productId],
        set: {
          availableQuantity: item.availableQuantity,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }

  async addMovement(
    merchantId: string,
    productId: string,
    movementType: InventoryMovementType,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<void> {
    await this.database.insert(inventoryMovements).values({
      merchantId,
      productId,
      movementType,
      quantity,
      reason,
      actorId,
    });
  }

  async restock(
    merchantId: string,
    productId: string,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<number> {
    return this.database.transaction(async (tx) => {
      // The sum is done by the database on the row it locks, so concurrent restocks and sales all count.
      const [row] = await tx
        .insert(inventoryItems)
        .values({ merchantId, productId, availableQuantity: quantity })
        .onConflictDoUpdate({
          target: [inventoryItems.merchantId, inventoryItems.productId],
          set: {
            availableQuantity: sql`${inventoryItems.availableQuantity} + ${quantity}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
        .returning({ quantity: inventoryItems.availableQuantity });

      await tx.insert(inventoryMovements).values({ merchantId, productId, movementType: 'RESTOCK', quantity, reason, actorId });
      return row.quantity;
    });
  }

  async getAvailableQuantity(merchantId: string, productId: string): Promise<number> {
    const item = await this.findByProductId(merchantId, productId);
    return item ? item.availableQuantity : 0;
  }
}
