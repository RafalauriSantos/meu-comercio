import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { Product } from '../domain/product';
import { ProductRepository } from '../domain/product-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { InventoryItem } from '@/modules/inventory/domain/inventory-item';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export const CreateProductSchema = z.object({
  barcode: z.string().trim().min(1, 'Código de barras é obrigatório').max(64),
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(160),
  salePrice: z.union([z.number(), z.string()]).refine(val => {
    try {
      const m = Money.fromDecimal(val);
      return !m.isNegative();
    } catch {
      return false;
    }
  }, 'Preço de venda deve ser um valor monetário válido e não negativo'),
  initialStock: z.number().int('Estoque inicial deve ser um número inteiro').min(0).optional().default(0),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export class BarcodeAlreadyExistsError extends Error {
  constructor(barcode: string) {
    super(`Já existe um produto cadastrado com o código de barras [${barcode}].`);
    this.name = 'BarcodeAlreadyExistsError';
  }
}

export class CreateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(merchantId: string, actorId: string, rawInput: unknown): Promise<Product> {
    const input = CreateProductSchema.parse(rawInput);
    const normalizedBarcode = input.barcode.trim();

    const existing = await this.productRepository.findByBarcode(merchantId, normalizedBarcode);
    if (existing) {
      throw new BarcodeAlreadyExistsError(normalizedBarcode);
    }

    const salePrice = Money.fromDecimal(input.salePrice);
    const product = Product.create(merchantId, normalizedBarcode, input.name.trim(), salePrice);

    await this.productRepository.save(product);

    const initialStock = input.initialStock ?? 0;
    const inventoryItem = new InventoryItem({
      merchantId,
      productId: product.id,
      availableQuantity: initialStock,
      updatedAt: new Date(),
    });
    await this.inventoryRepository.save(inventoryItem);

    await this.auditPort.record(
      merchantId,
      'PRODUCT_CREATED',
      actorId,
      'PRODUCT',
      product.id,
      {
        barcode: product.barcode,
        name: product.name,
        salePrice: product.salePrice.toDecimal(),
        initialStock,
      }
    );

    if (initialStock > 0) {
      await this.inventoryRepository.addMovement(
        merchantId,
        product.id,
        'RESTOCK',
        initialStock,
        'Estoque inicial no cadastro do produto',
        actorId
      );

      await this.auditPort.record(
        merchantId,
        'INVENTORY_RESTOCKED',
        actorId,
        'INVENTORY_ITEM',
        product.id,
        {
          quantity: initialStock,
          newQuantity: initialStock,
          reason: 'Estoque inicial no cadastro do produto',
        }
      );
    }

    return product;
  }
}
