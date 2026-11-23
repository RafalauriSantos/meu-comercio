import { z } from 'zod';
import { ProductRepository } from '@/modules/products/domain/product-repository.port';
import { InventoryRepository } from '../domain/inventory-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export const RestockInventorySchema = z.object({
  productId: z.string().uuid('ID do produto inválido'),
  quantity: z.number().int('Quantidade deve ser inteira').positive('Quantidade de reposição deve ser maior que zero'),
  reason: z.string().trim().min(2, 'Informe o motivo da reposição').max(240),
});

export type RestockInventoryInput = z.infer<typeof RestockInventorySchema>;

export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Produto com ID [${productId}] não foi encontrado.`);
    this.name = 'ProductNotFoundError';
  }
}

export class RestockInventoryUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(merchantId: string, actorId: string, rawInput: unknown): Promise<number> {
    const input = RestockInventorySchema.parse(rawInput);

    const product = await this.productRepository.findById(merchantId, input.productId);
    if (!product || !product.active) {
      throw new ProductNotFoundError(input.productId);
    }

    // The repository adds to the quantity that is in the database and records the movement in one transaction.
    const newAvailableQuantity = await this.inventoryRepository.restock(
      merchantId,
      input.productId,
      input.quantity,
      input.reason,
      actorId
    );

    await this.auditPort.record(
      merchantId,
      'INVENTORY_RESTOCKED',
      actorId,
      'INVENTORY_ITEM',
      input.productId,
      {
        productName: product.name,
        barcode: product.barcode,
        quantityRestocked: input.quantity,
        newAvailableQuantity,
        reason: input.reason,
      }
    );

    return newAvailableQuantity;
  }
}
