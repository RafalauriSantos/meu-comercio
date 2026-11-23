import { InventoryItem } from './inventory-item';

export type InventoryMovementType = 'RESTOCK' | 'SALE' | 'SALE_REFUND' | 'ADJUSTMENT' | 'RETURN';

export interface InventoryRepository {
  findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null>;
  save(item: InventoryItem): Promise<void>;
  addMovement(
    merchantId: string,
    productId: string,
    movementType: InventoryMovementType,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<void>;
  getAvailableQuantity(merchantId: string, productId: string): Promise<number>;
  /**
   * Adds the quantity to the stock that is in the database now and records the RESTOCK movement, in one transaction.
   * It never reads the quantity first: a sale or another restock that commits in between is not lost (19.6).
   * Returns the new quantity.
   */
  restock(merchantId: string, productId: string, quantity: number, reason: string, actorId: string): Promise<number>;
}
