import { ProductRepository } from '../domain/product-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { ProductWithInventory } from './find-product-by-barcode.use-case';

export class SearchProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository
  ) {}

  public async execute(merchantId: string, query: string, limit = 20): Promise<ProductWithInventory[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const products = await this.productRepository.searchByNameOrBarcode(merchantId, trimmed, limit);

    return Promise.all(
      products.map(async product => {
        const availableQuantity = await this.inventoryRepository.getAvailableQuantity(merchantId, product.id);
        return {
          product,
          availableQuantity,
        };
      })
    );
  }
}
