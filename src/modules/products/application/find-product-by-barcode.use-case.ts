import { Product } from '../domain/product';
import { ProductRepository } from '../domain/product-repository.port';
import { ProductDeactivatedError } from '../domain/product-errors';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';

export interface ProductWithInventory {
  product: Product;
  availableQuantity: number;
}

export class FindProductByBarcodeUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository
  ) {}

  public async execute(merchantId: string, barcode: string): Promise<ProductWithInventory | null> {
    const normalized = barcode.trim();
    if (!normalized) return null;

    const product = await this.productRepository.findByBarcode(merchantId, normalized);
    if (!product) {
      return null;
    }
    if (!product.active) {
      throw new ProductDeactivatedError(product.name);
    }

    const availableQuantity = await this.inventoryRepository.getAvailableQuantity(merchantId, product.id);
    return {
      product,
      availableQuantity,
    };
  }
}
