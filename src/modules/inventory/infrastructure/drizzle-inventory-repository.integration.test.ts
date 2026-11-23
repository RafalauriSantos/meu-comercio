import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import type { ProductRepository } from '@/modules/products/domain/product-repository.port';
import type { AuditPort } from '@/modules/audit/domain/audit.port';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { RestockInventoryUseCase } from '../application/restock-inventory.use-case';
import { inventoryItems, inventoryMovements } from './inventory.schema';
import { DrizzleInventoryRepository } from './drizzle-inventory-repository';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// 19.6: a restock must add to the quantity that is in the database now, not to the one it read a moment ago,
// or a sale (or another restock) that committed in between is lost.
describe.skipIf(!TEST_DATABASE_URL)('restock under concurrency (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedProduct(stock: number) {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    const [product] = await database
      .insert(products)
      .values({ merchantId: merchant.id, barcode: `bc-${Math.random().toString(36).slice(2)}`, name: 'Leite', salePrice: '10.00' })
      .returning({ id: products.id });
    await database.insert(inventoryItems).values({ merchantId: merchant.id, productId: product.id, availableQuantity: stock });
    return { merchantId: merchant.id, productId: product.id };
  }

  function buildUseCase() {
    const productRepository = {
      findById: async () => ({ active: true, name: 'Leite', barcode: '123' }),
    } as unknown as ProductRepository;
    const auditPort = { record: async () => {} } as unknown as AuditPort;
    return new RestockInventoryUseCase(productRepository, new DrizzleInventoryRepository(database), auditPort);
  }

  async function quantityOf(merchantId: string, productId: string): Promise<number> {
    const [row] = await database
      .select({ quantity: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, productId)));
    return row.quantity;
  }

  /** What a sale does to the stock: subtracts from the quantity in the database. */
  async function sellOne(merchantId: string, productId: string) {
    await database
      .update(inventoryItems)
      .set({ availableQuantity: sql`${inventoryItems.availableQuantity} - 1` })
      .where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, productId)));
  }

  it('restocks made at the same time are all counted', async () => {
    const { merchantId, productId } = await seedProduct(0);
    const useCase = buildUseCase();

    await Promise.all(
      Array.from({ length: 30 }, () => useCase.execute(merchantId, 'dona', { productId, quantity: 1, reason: 'Compra' }))
    );

    expect(await quantityOf(merchantId, productId)).toBe(30);
    const movements = await database
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.merchantId, merchantId), eq(inventoryMovements.productId, productId)));
    expect(movements).toHaveLength(30);
  });

  it('a sale that commits while a restock is running is not lost', async () => {
    const { merchantId, productId } = await seedProduct(20);
    const useCase = buildUseCase();

    await Promise.all([
      ...Array.from({ length: 15 }, () => useCase.execute(merchantId, 'dona', { productId, quantity: 1, reason: 'Compra' })),
      ...Array.from({ length: 15 }, () => sellOne(merchantId, productId)),
    ]);

    expect(await quantityOf(merchantId, productId)).toBe(20);
  });

  it('restocking a product that has no stock row yet creates it with the quantity', async () => {
    const { merchantId, productId } = await seedProduct(0);
    await database.delete(inventoryItems).where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, productId)));

    const total = await buildUseCase().execute(merchantId, 'dona', { productId, quantity: 7, reason: 'Primeira compra' });

    expect(total).toBe(7);
    expect(await quantityOf(merchantId, productId)).toBe(7);
  });
});
