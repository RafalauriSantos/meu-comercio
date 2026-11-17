import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { products } from './products.schema';
import { DrizzleProductRepository } from './drizzle-product-repository';

// The real Drizzle repository reads the global `db`. Point it at the disposable test database.
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
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleProductRepository.listPage (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const repo = new DrizzleProductRepository();

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

  async function freshMerchant(): Promise<string> {
    const [row] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    return row.id;
  }

  // Names are zero padded ("Produto 001") so the alphabetical order is the numeric one.
  async function seedProducts(merchantId: string, count: number, namePrefix = 'Produto') {
    const rows = Array.from({ length: count }, (_, i) => ({
      merchantId,
      barcode: `${namePrefix}-${i}`,
      name: `${namePrefix} ${String(i + 1).padStart(3, '0')}`,
      salePrice: '1.00',
    }));
    await database.insert(products).values(rows);
  }

  async function walkAllPages(merchantId: string, pageSize: number, query = '') {
    const ids: string[] = [];
    const names: string[] = [];
    for (let page = 1; page < 100; page++) {
      const result = await repo.listPage(merchantId, { query, page, pageSize });
      for (const item of result.items) {
        ids.push(item.product.id);
        names.push(item.product.name);
      }
      if (!result.hasMore) break;
    }
    return { ids, names };
  }

  it('returns the first 100 of 101 products ordered by name, with hasMore', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 101);

    const result = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });

    expect(result.items).toHaveLength(100);
    expect(result.hasMore).toBe(true);
    const names = result.items.map((i) => i.product.name);
    expect(names).toEqual([...names].sort());
    expect(names[0]).toBe('Produto 001');
    expect(names[99]).toBe('Produto 100');
  });

  it('page 2 of 101 products returns the rest and hasMore is false', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 101);

    const result = await repo.listPage(merchantId, { query: '', page: 2, pageSize: 100 });

    expect(result.items.map((i) => i.product.name)).toEqual(['Produto 101']);
    expect(result.hasMore).toBe(false);
  });

  it('walks 250 products in pages without repeating or skipping any', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 250);

    const { ids, names } = await walkAllPages(merchantId, 100);

    expect(ids).toHaveLength(250);
    expect(new Set(ids).size).toBe(250);
    expect(names).toEqual([...names].sort());
  });

  it('honours a pageSize of 50', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 120);

    const first = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 50 });
    const third = await repo.listPage(merchantId, { query: '', page: 3, pageSize: 50 });

    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(third.items).toHaveLength(20);
    expect(third.hasMore).toBe(false);
  });

  it('returns an empty list past the last page', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 5);

    const result = await repo.listPage(merchantId, { query: '', page: 9, pageSize: 100 });

    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('search reaches a product after the 100th', async () => {
    const merchantId = await freshMerchant();
    await seedProducts(merchantId, 150);
    await database.insert(products).values({ merchantId, barcode: '7891', name: 'Zzz Raro', salePrice: '2.00' });

    const byName = await repo.listPage(merchantId, { query: 'raro', page: 1, pageSize: 100 });
    const byBarcode = await repo.listPage(merchantId, { query: '7891', page: 1, pageSize: 100 });
    const many = await walkAllPages(merchantId, 100, 'Produto');

    expect(byName.items.map((i) => i.product.name)).toEqual(['Zzz Raro']);
    expect(byBarcode.items.map((i) => i.product.name)).toEqual(['Zzz Raro']);
    expect(many.ids).toHaveLength(150);
  });

  it('hides inactive products and products of other merchants', async () => {
    const merchantId = await freshMerchant();
    const other = await freshMerchant();
    await database.insert(products).values([
      { merchantId, barcode: 'a1', name: 'Ativo', salePrice: '1.00' },
      { merchantId, barcode: 'a2', name: 'Inativo', salePrice: '1.00', active: false },
      { merchantId: other, barcode: 'a3', name: 'De outra loja', salePrice: '1.00' },
    ]);

    const result = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });

    expect(result.items.map((i) => i.product.name)).toEqual(['Ativo']);
  });

  it('keeps a stable order for equal names (tie broken by id) across pages', async () => {
    const merchantId = await freshMerchant();
    await database
      .insert(products)
      .values(Array.from({ length: 30 }, (_, i) => ({ merchantId, barcode: `eq-${i}`, name: 'Mesmo Nome', salePrice: '1.00' })));

    const all = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });
    const again = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });
    const walked = await walkAllPages(merchantId, 7);

    const ids = all.items.map((i) => i.product.id);
    expect(ids).toEqual([...ids].sort());
    expect(again.items.map((i) => i.product.id)).toEqual(ids);
    expect(walked.ids).toEqual(ids);
  });

  it('brings the available quantity in the same query (0 when there is no stock row)', async () => {
    const merchantId = await freshMerchant();
    const [rice, beans] = await database
      .insert(products)
      .values([
        { merchantId, barcode: 'q1', name: 'Arroz', salePrice: '5.00' },
        { merchantId, barcode: 'q2', name: 'Feijão', salePrice: '5.00', unit: 'KG' },
        { merchantId, barcode: 'q3', name: 'Sal', salePrice: '5.00' },
      ])
      .returning({ id: products.id });
    await database.insert(inventoryItems).values([
      { merchantId, productId: rice.id, availableQuantity: 12 },
      { merchantId, productId: beans.id, availableQuantity: 2500 },
    ]);

    const result = await repo.listPage(merchantId, { query: '', page: 1, pageSize: 100 });

    expect(result.items.map((i) => [i.product.name, i.product.unit, i.availableQuantity])).toEqual([
      ['Arroz', 'UN', 12],
      ['Feijão', 'KG', 2500],
      ['Sal', 'UN', 0],
    ]);
  });
});
