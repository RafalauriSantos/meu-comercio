import { describe, it, expect, beforeEach } from 'vitest';
import { Product } from '../domain/product';
import { ProductRepository } from '../domain/product-repository.port';
import { InventoryRepository, InventoryMovementType } from '@/modules/inventory/domain/inventory-repository.port';
import { InventoryItem, InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CreateProductUseCase,
  BarcodeAlreadyExistsError,
} from './create-product.use-case';
import { FindProductByBarcodeUseCase } from './find-product-by-barcode.use-case';
import { SearchProductsUseCase } from './search-products.use-case';
import { RestockInventoryUseCase } from '@/modules/inventory/application/restock-inventory.use-case';

class InMemoryProductRepository implements ProductRepository {
  public products: Map<string, Product> = new Map();

  async save(product: Product): Promise<void> {
    this.products.set(`${product.merchantId}:${product.id}`, product);
  }

  async findByBarcode(merchantId: string, barcode: string): Promise<Product | null> {
    const normalized = barcode.trim();
    for (const p of this.products.values()) {
      if (p.merchantId === merchantId && p.barcode === normalized && p.active) {
        return p;
      }
    }
    return null;
  }

  async findById(merchantId: string, id: string): Promise<Product | null> {
    return this.products.get(`${merchantId}:${id}`) ?? null;
  }

  async searchByNameOrBarcode(merchantId: string, query: string, limit = 20): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    const results: Product[] = [];
    for (const p of this.products.values()) {
      if (p.merchantId === merchantId && p.active) {
        if (p.barcode.includes(q) || p.name.toLowerCase().includes(q)) {
          results.push(p);
          if (results.length >= limit) break;
        }
      }
    }
    return results;
  }
}

class InMemoryInventoryRepository implements InventoryRepository {
  public items: Map<string, InventoryItem> = new Map();
  public movements: Array<{
    merchantId: string;
    productId: string;
    movementType: InventoryMovementType;
    quantity: number;
    reason: string;
    actorId: string;
  }> = [];

  async findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null> {
    return this.items.get(`${merchantId}:${productId}`) ?? null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(`${item.merchantId}:${item.productId}`, item);
  }

  async addMovement(
    merchantId: string,
    productId: string,
    movementType: InventoryMovementType,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<void> {
    this.movements.push({ merchantId, productId, movementType, quantity, reason, actorId });
  }

  async getAvailableQuantity(merchantId: string, productId: string): Promise<number> {
    const item = await this.findByProductId(merchantId, productId);
    return item ? item.availableQuantity : 0;
  }
}

class MockAuditPort implements AuditPort {
  public records: Array<{ eventType: string; actorId: string; details: Record<string, unknown> }> = [];

  async record(
    _merchantId: string,
    eventType: string,
    actorId: string,
    _aggregateType: string,
    _aggregateId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    this.records.push({ eventType, actorId, details });
  }
}

describe('Products & Inventory Use Cases', () => {
  let productRepo: InMemoryProductRepository;
  let inventoryRepo: InMemoryInventoryRepository;
  let audit: MockAuditPort;

  let createProductUseCase: CreateProductUseCase;
  let findByBarcodeUseCase: FindProductByBarcodeUseCase;
  let searchProductsUseCase: SearchProductsUseCase;
  let restockUseCase: RestockInventoryUseCase;

  const MERCHANT_ID = 'merchant-test-123';
  const ACTOR_ID = 'tatiane';

  beforeEach(() => {
    productRepo = new InMemoryProductRepository();
    inventoryRepo = new InMemoryInventoryRepository();
    audit = new MockAuditPort();

    createProductUseCase = new CreateProductUseCase(productRepo, inventoryRepo, audit);
    findByBarcodeUseCase = new FindProductByBarcodeUseCase(productRepo, inventoryRepo);
    searchProductsUseCase = new SearchProductsUseCase(productRepo, inventoryRepo);
    restockUseCase = new RestockInventoryUseCase(productRepo, inventoryRepo, audit);
  });

  it('should successfully register a product with initial stock and record restock audit', async () => {
    const product = await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '7891000100103',
      name: 'Leite Integral 1L',
      salePrice: '5.99',
      initialStock: 24,
    });

    expect(product.barcode).toBe('7891000100103');
    expect(product.name).toBe('Leite Integral 1L');
    expect(product.salePrice.toDecimal()).toBe('5.99');

    const stock = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, product.id);
    expect(stock).toBe(24);

    expect(inventoryRepo.movements).toHaveLength(1);
    expect(inventoryRepo.movements[0].movementType).toBe('RESTOCK');
    expect(inventoryRepo.movements[0].quantity).toBe(24);

    expect(audit.records).toHaveLength(2); // PRODUCT_CREATED and INVENTORY_RESTOCKED
  });

  it('should reject creating a product with duplicate barcode in the same merchant', async () => {
    await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '7891000100103',
      name: 'Leite Integral 1L',
      salePrice: '5.99',
    });

    await expect(
      createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
        barcode: '7891000100103',
        name: 'Outro Leite',
        salePrice: '6.50',
      })
    ).rejects.toThrow(BarcodeAlreadyExistsError);
  });

  it('should find product by barcode including its available inventory', async () => {
    const created = await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '7891234567890',
      name: 'Refrigerante Cola 2L',
      salePrice: '8.50',
      initialStock: 10,
    });

    const found = await findByBarcodeUseCase.execute(MERCHANT_ID, '7891234567890');
    expect(found).not.toBeNull();
    expect(found?.product.id).toBe(created.id);
    expect(found?.product.name).toBe('Refrigerante Cola 2L');
    expect(found?.availableQuantity).toBe(10);
  });

  it('should search products by name or barcode substring', async () => {
    await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '111111',
      name: 'Arroz Branco 5kg',
      salePrice: '28.90',
      initialStock: 5,
    });
    await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '222222',
      name: 'Feijão Carioca 1kg',
      salePrice: '7.90',
      initialStock: 12,
    });

    const searchByName = await searchProductsUseCase.execute(MERCHANT_ID, 'arroz');
    expect(searchByName).toHaveLength(1);
    expect(searchByName[0].product.name).toBe('Arroz Branco 5kg');

    const searchByBarcode = await searchProductsUseCase.execute(MERCHANT_ID, '222');
    expect(searchByBarcode).toHaveLength(1);
    expect(searchByBarcode[0].product.name).toBe('Feijão Carioca 1kg');
  });

  it('should restock inventory with audit record', async () => {
    const product = await createProductUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      barcode: '7899999999999',
      name: 'Café Torrado 500g',
      salePrice: '16.90',
      initialStock: 5,
    });

    const newStock = await restockUseCase.execute(MERCHANT_ID, ACTOR_ID, {
      productId: product.id,
      quantity: 15,
      reason: 'Reposição semanal de fornecedor',
    });

    expect(newStock).toBe(20);
    expect(await inventoryRepo.getAvailableQuantity(MERCHANT_ID, product.id)).toBe(20);

    const restockMovement = inventoryRepo.movements.find(
      m => m.productId === product.id && m.reason === 'Reposição semanal de fornecedor'
    );
    expect(restockMovement).toBeDefined();
    expect(restockMovement?.quantity).toBe(15);
  });

  it('should enforce zero negative stock constraint in inventory item entity', () => {
    const item = new InventoryItem({
      merchantId: MERCHANT_ID,
      productId: 'prod-123',
      availableQuantity: 3,
      updatedAt: new Date(),
    });

    item.deduct(2);
    expect(item.availableQuantity).toBe(1);

    expect(() => item.deduct(5)).toThrow(InsufficientStockError);
    expect(item.availableQuantity).toBe(1); // Unchanged
  });
});
