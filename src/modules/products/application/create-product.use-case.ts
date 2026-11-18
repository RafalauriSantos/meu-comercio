import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { Product } from '../domain/product';
import { InvalidBarcodeError, ProductBarcodeConflictError } from '../domain/product-errors';
import { generateBarcode, isValidBarcode } from '../domain/generated-barcode';
import type { ProductUnit } from '@/shared/domain/product-unit';
import { ProductRepository } from '../domain/product-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { InventoryItem } from '@/modules/inventory/domain/inventory-item';
import { AuditPort } from '@/modules/audit/domain/audit.port';

// Fields shared by the single create and the CSV import; the import still requires the barcode.
export const ProductRowSchema = z.object({
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
  // For a product sold by weight (KG) the price is per kilogram and the initial stock is in grams.
  unit: z.enum(['UN', 'KG']).optional().default('UN'),
  initialStock: z.number().int('Estoque inicial deve ser um número inteiro').min(0).optional().default(0),
});

// On create the barcode is optional: absent, empty or only spaces means the server generates it (D-23).
export const CreateProductSchema = ProductRowSchema.extend({
  barcode: z.string().trim().max(64).optional().transform(value => value || undefined),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export class BarcodeAlreadyExistsError extends Error {
  constructor(barcode: string) {
    super(`Já existe um produto cadastrado com o código de barras [${barcode}].`);
    this.name = 'BarcodeAlreadyExistsError';
  }
}

export class BarcodeGenerationFailedError extends Error {
  constructor() {
    super('Não foi possível gerar um código de barras. Tente novamente.');
    this.name = 'BarcodeGenerationFailedError';
  }
}

export class OperatorProductRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorProductRuleError';
  }
}

// D-25: a non-owner registers only with a price above zero and never with initial stock.
export function assertOperatorProductRules(rawInput: unknown): void {
  const input = CreateProductSchema.parse(rawInput);
  if (!Money.fromDecimal(input.salePrice).isPositive()) {
    throw new OperatorProductRuleError('O preço de venda deve ser maior que zero.');
  }
  if (input.initialStock > 0) {
    throw new OperatorProductRuleError('Apenas a proprietária pode definir o estoque inicial do produto.');
  }
}

const MAX_GENERATION_ATTEMPTS = 5;

export class CreateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly auditPort: AuditPort,
    private readonly random: () => number = Math.random
  ) {}

  public async execute(merchantId: string, actorId: string, rawInput: unknown): Promise<Product> {
    const input = CreateProductSchema.parse(rawInput);
    // D-30: a typed or scanned barcode must be a real one; absent means the server generates it.
    if (input.barcode !== undefined && !isValidBarcode(input.barcode)) throw new InvalidBarcodeError();
    const salePrice = Money.fromDecimal(input.salePrice);
    const name = input.name.trim();
    const barcodeGenerated = input.barcode === undefined;

    // A typed or scanned barcode is never replaced; a generated one is redrawn on collision.
    const product = input.barcode === undefined
      ? await this.createWithGeneratedBarcode(merchantId, name, salePrice, input.unit)
      : await this.createWithTypedBarcode(merchantId, input.barcode, name, salePrice, input.unit);

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
        barcodeGenerated,
        name: product.name,
        salePrice: product.salePrice.toDecimal(),
        unit: product.unit,
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

  private async createWithTypedBarcode(merchantId: string, barcode: string, name: string, salePrice: Money, unit: ProductUnit): Promise<Product> {
    if (await this.productRepository.findByBarcode(merchantId, barcode)) {
      throw new BarcodeAlreadyExistsError(barcode);
    }
    const product = Product.create(merchantId, barcode, name, salePrice, undefined, unit);
    try {
      await this.productRepository.create(product);
    } catch (error) {
      if (error instanceof ProductBarcodeConflictError) throw new BarcodeAlreadyExistsError(barcode);
      throw error;
    }
    return product;
  }

  private async createWithGeneratedBarcode(merchantId: string, name: string, salePrice: Money, unit: ProductUnit): Promise<Product> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const barcode = generateBarcode(this.random);
      if (await this.productRepository.findByBarcode(merchantId, barcode)) continue;
      const product = Product.create(merchantId, barcode, name, salePrice, undefined, unit);
      try {
        await this.productRepository.create(product);
        return product;
      } catch (error) {
        if (!(error instanceof ProductBarcodeConflictError)) throw error;
      }
    }
    throw new BarcodeGenerationFailedError();
  }
}
