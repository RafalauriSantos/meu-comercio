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
}
