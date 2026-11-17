import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { Product } from '../domain/product';
import { ProductChanges, ProductRepository, ProductUpdateContext } from '../domain/product-repository.port';
import { ProductBarcodeConflictError } from '../domain/product-errors';
import { generateBarcode } from '../domain/generated-barcode';
import { BarcodeAlreadyExistsError, BarcodeGenerationFailedError } from './create-product.use-case';

// Partial body: .strict() refuses unit, active and any unknown field (the unit never changes).
export const UpdateProductSchema = z
  .object({
    barcode: z.string().trim().min(1, 'Código de barras é obrigatório').max(64).optional(),
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(160).optional(),
    salePrice: z
      .union([z.number(), z.string()])
      .refine((val) => {
        try {
          return Money.fromDecimal(val).isPositive();
        } catch {
          return false;
        }
      }, 'Preço de venda deve ser um valor monetário válido e maior que zero')
      .optional(),
    // Replace the barcode with a generated one (D-24). The server draws it; it cannot come with a typed barcode.
    generateBarcode: z.literal(true).optional(),
    // The updatedAt the caller read. If the product changed since, the edit is refused.
    expectedUpdatedAt: z.iso.datetime('Data de leitura do produto inválida').optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.barcode !== undefined ||
      input.name !== undefined ||
      input.salePrice !== undefined ||
      input.generateBarcode !== undefined,
    'Informe ao menos um campo para alterar: nome, preço de venda ou código de barras.'
  )
  .refine(
    (input) => !(input.generateBarcode && input.barcode !== undefined),
    { message: 'Informe o código de barras ou peça para gerar um, não os dois.', path: ['generateBarcode'] }
  );

const MAX_GENERATION_ATTEMPTS = 5;

export class ProductNotFoundError extends Error {
  constructor() {
    super('Produto não encontrado.');
    this.name = 'ProductNotFoundError';
  }
}

export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly random: () => number = Math.random
  ) {}

  public async execute(merchantId: string, actorId: string, productId: string, rawInput: unknown): Promise<Product> {
    const input = UpdateProductSchema.parse(rawInput);

    const changes: ProductChanges = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      ...(input.salePrice !== undefined && { salePrice: Money.fromDecimal(input.salePrice) }),
    };

    const context = {
      actorId,
      expectedUpdatedAt: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : undefined,
    };

    if (input.generateBarcode) {
      // A typed barcode conflicts with the user; a generated one is redrawn (each try is its own transaction).
      for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        try {
          return await this.update(merchantId, productId, { ...changes, barcode: generateBarcode(this.random) }, { ...context, barcodeGenerated: true });
        } catch (error) {
          if (!(error instanceof ProductBarcodeConflictError)) throw error;
        }
      }
      throw new BarcodeGenerationFailedError();
    }

    try {
      return await this.update(merchantId, productId, changes, context);
    } catch (error) {
      if (error instanceof ProductBarcodeConflictError) throw new BarcodeAlreadyExistsError(error.barcode);
      throw error;
    }
  }

  private async update(merchantId: string, productId: string, changes: ProductChanges, context: ProductUpdateContext): Promise<Product> {
    const product = await this.productRepository.updateDetails(merchantId, productId, changes, context);
    if (!product) throw new ProductNotFoundError();
    return product;
  }
}
