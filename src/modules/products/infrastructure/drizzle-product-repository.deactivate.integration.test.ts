import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { products } from './products.schema';
import { DrizzleProductRepository } from './drizzle-product-repository';
import { DrizzleProductImportStore } from './drizzle-product-import-store';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { UpdateProductUseCase } from '../application/update-product.use-case';
import { FindProductByBarcodeUseCase } from '../application/find-product-by-barcode.use-case';
import { BarcodeAlreadyExistsError, CreateProductUseCase } from '../application/create-product.use-case';
import { ProductChangedError, ProductDeactivatedError } from '../domain/product-errors';

// The real Drizzle repositories read the global `db`. Point it at the disposable test database.
const holder = vi.hoisted(() => ({ db: null as object | null }));
vi.mock('@/shared/infrastructure/db/connection', () => {
  const current = () => {
    if (!holder.db) throw new Error('Test database is not ready.');
    return holder.db;
  };
  return {
    getDb: current,
    db: new Proxy(
      {},
      {
        get(_target, prop) {
          const target = current();
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }
    ),
  };
});

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('Exclude and restore a product, D-27 (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const repo = new DrizzleProductRepository();
  const update = () => new UpdateProductUseCase(repo);

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    holder.db = database;
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedShop(barcode = 'A1', stock = 10) {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    const [product] = await database
      .insert(products)
      .values({ merchantId: merchant.id, barcode, name: `Produto ${barcode}`, salePrice: '24.9000' })
      .returning();
    await database.insert(inventoryItems).values({ merchantId: merchant.id, productId: product.id, availableQuantity: stock });
    await database.insert(inventoryMovements).values({
      merchantId: merchant.id,
      productId: product.id,
      movementType: 'RESTOCK',
      quantity: stock,
      reason: 'Estoque inicial',
      actorId: 'dona',
    });
    return { merchantId: merchant.id, product };
  }

  async function row(id: string) {
    const [found] = await database.select().from(products).where(eq(products.id, id));
    return found;
  }

  async function auditOf(id: string) {
    return database.select().from(auditEvents).where(eq(auditEvents.aggregateId, id));
  }

  async function counts(merchantId: string) {
    const count = async (table: string) =>
      Number(
        (await database.execute(sql`select count(*)::int as n from ${sql.raw(table)} where merchant_id = ${merchantId}`)).rows[0].n
      );
    return {
      products: await count('products'),
      inventoryItems: await count('inventory_items'),
      inventoryMovements: await count('inventory_movements'),
      saleItems: await count('sale_items'),
    };
  }

  it('excludes: audits active from/to once, bumps updated_at, keeps price, stock and barcode, deletes nothing', async () => {
    const { merchantId, product } = await seedShop();
    const rowsBefore = await counts(merchantId);

    const result = await update().execute(merchantId, 'dona', product.id, { active: false });

    expect(result.active).toBe(false);
    const after = await row(product.id);
    expect(after).toMatchObject({ active: false, barcode: 'A1', salePrice: '24.9000', name: 'Produto A1' });
    expect(after.updatedAt.getTime()).toBeGreaterThan(product.updatedAt.getTime());
    const events = await auditOf(product.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'PRODUCT_UPDATED', actorId: 'dona' });
    expect(events[0].details).toEqual({ changes: { active: { from: true, to: false } } });
    expect(await counts(merchantId)).toEqual(rowsBefore);
    const [stock] = await database.select().from(inventoryItems).where(eq(inventoryItems.productId, product.id));
    expect(stock.availableQuantity).toBe(10);
  });

  it('asking for the value it already has writes no event and keeps updated_at', async () => {
    const { merchantId, product } = await seedShop();

    await update().execute(merchantId, 'dona', product.id, { active: true });

    expect(await auditOf(product.id)).toHaveLength(0);
    expect((await row(product.id)).updatedAt).toEqual(product.updatedAt);
  });

  it('a stale expectedUpdatedAt is refused and nothing changes', async () => {
    const { merchantId, product } = await seedShop();

    await expect(
      update().execute(merchantId, 'dona', product.id, { active: false, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })
    ).rejects.toBeInstanceOf(ProductChangedError);

    expect((await row(product.id)).active).toBe(true);
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('a product of another shop is not found and stays untouched', async () => {
    const { product } = await seedShop();
    const { merchantId: other } = await seedShop('B1');

    await expect(update().execute(other, 'dona', product.id, { active: false })).rejects.toThrow('Produto não encontrado.');

    expect((await row(product.id)).active).toBe(true);
  });

  it('active together with the name is one transaction and one event with both changes', async () => {
    const { merchantId, product } = await seedShop();

    await update().execute(merchantId, 'dona', product.id, { name: 'Arroz Velho', active: false });

    const events = await auditOf(product.id);
    expect(events).toHaveLength(1);
    expect(Object.keys((events[0].details as { changes: object }).changes).sort()).toEqual(['active', 'name']);
  });

  it('an excluded product leaves the default list, the summary and the search; ?active=false lists it with its stock', async () => {
    const { merchantId, product } = await seedShop('A1', 10);
    await database.insert(products).values({ merchantId, barcode: 'A2', name: 'Produto A2', salePrice: '5.0000' });
    expect((await repo.getSummary(merchantId)).total).toBe(2);

    await update().execute(merchantId, 'dona', product.id, { active: false });

    const defaultList = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });
    expect(defaultList.items.map((i) => i.product.barcode)).toEqual(['A2']);
    const onlyExcluded = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100, active: false });
    expect(onlyExcluded.items.map((i) => [i.product.barcode, i.product.active, i.availableQuantity])).toEqual([['A1', false, 10]]);
    const summary = await repo.getSummary(merchantId);
    expect(summary.total).toBe(1);
    expect(summary.stockValue.toDecimal()).toBe('0.00');
    expect(await repo.searchByNameOrBarcode(merchantId, 'A1')).toHaveLength(0);
  });

  it('scanning an excluded barcode says it is deactivated; an unknown one is still null', async () => {
    const { merchantId, product } = await seedShop('A1');
    const find = new FindProductByBarcodeUseCase(repo, new DrizzleInventoryRepository());
    await update().execute(merchantId, 'dona', product.id, { active: false });

    await expect(find.execute(merchantId, 'A1')).rejects.toBeInstanceOf(ProductDeactivatedError);
    await expect(find.execute(merchantId, 'A1')).rejects.toThrow('Produto "Produto A1" está desativado.');
    expect(await find.execute(merchantId, 'NOPE')).toBeNull();
  });

  it('restores: back to the list, search and scan with the same price, stock and barcode', async () => {
    const { merchantId, product } = await seedShop('A1', 10);
    const find = new FindProductByBarcodeUseCase(repo, new DrizzleInventoryRepository());
    await update().execute(merchantId, 'dona', product.id, { active: false });

    await update().execute(merchantId, 'dona', product.id, { active: true });

    const found = await find.execute(merchantId, 'A1');
    expect(found?.product.salePrice.toDecimal()).toBe('24.90');
    expect(found?.availableQuantity).toBe(10);
    expect((await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 })).items).toHaveLength(1);
    expect(await repo.searchByNameOrBarcode(merchantId, 'A1')).toHaveLength(1);
    expect(await auditOf(product.id)).toHaveLength(2);
  });

  it('the barcode stays reserved: creating another product with it, or switching one to it, is refused', async () => {
    const { merchantId, product } = await seedShop('7891000100103');
    const [other] = await database
      .insert(products)
      .values({ merchantId, barcode: 'A2', name: 'Produto A2', salePrice: '5.0000' })
      .returning();
    await update().execute(merchantId, 'dona', product.id, { active: false });

    const create = new CreateProductUseCase(repo, new DrizzleInventoryRepository(), { record: vi.fn() } as never);
    await expect(
      create.execute(merchantId, 'dona', { barcode: '7891000100103', name: 'Repetido', salePrice: '3.00' })
    ).rejects.toBeInstanceOf(BarcodeAlreadyExistsError);
    await expect(update().execute(merchantId, 'dona', other.id, { barcode: '7891000100103' })).rejects.toBeInstanceOf(BarcodeAlreadyExistsError);
    expect((await row(other.id)).barcode).toBe('A2');
  });

  it('the CSV import sees the excluded barcode as registered, and as deleted', async () => {
    const { merchantId, product } = await seedShop('A1');
    await update().execute(merchantId, 'dona', product.id, { active: false });

    const found = await new DrizzleProductImportStore(database).findProductsByBarcodes(merchantId, ['A1', 'ZZ']);

    expect([...found.keys()]).toEqual(['A1']);
    expect(found.get('A1')?.active).toBe(false);
  });
});
