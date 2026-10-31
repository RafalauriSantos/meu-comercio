import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { inventoryItems, inventoryMovements } from './inventory.schema';
import { InventoryItem } from '../domain/inventory-item';
import { InventoryRepository, InventoryMovementType } from '../domain/inventory-repository.port';

export class DrizzleInventoryRepository implements InventoryRepository {
  async findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null> {
    const rows = await db
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
    await db
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
    await db.insert(inventoryMovements).values({
      merchantId,
      productId,
      movementType,
      quantity,
      reason,
      actorId,
    });
  }

  async getAvailableQuantity(merchantId: string, productId: string): Promise<number> {
    const item = await this.findByProductId(merchantId, productId);
    return item ? item.availableQuantity : 0;
  }
}
