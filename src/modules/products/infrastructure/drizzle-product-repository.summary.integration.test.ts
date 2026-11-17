import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { countNeedingRestock, inventoryValue } from '@/frontend/management/stock';
import { Money } from '@/shared/domain/money';
import type { ProductUnit } from '@/shared/domain/product-unit';
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
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleProductRepository.getSummary (Postgres)', () => {
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

  interface Seed {
    price: string;
    unit?: ProductUnit;
    quantity?: number; // undefined: no stock row
    active?: boolean;
  }

  async function seed(merchantId: string, rows: Seed[]) {
    const inserted = await database
      .insert(products)
      .values(
        rows.map((r, i) => ({
          merchantId,
          barcode: `s-${i}`,
          name: `Item ${i}`,
          salePrice: r.price,
          unit: r.unit ?? 'UN',
          active: r.active ?? true,
        }))
      )
      .returning({ id: products.id, barcode: products.barcode });
    const byBarcode = new Map(inserted.map((p) => [p.barcode, p.id]));
    const stock = rows.flatMap((r, i) =>
      r.quantity === undefined ? [] : [{ merchantId, productId: byBarcode.get(`s-${i}`)!, availableQuantity: r.quantity }]
    );
    if (stock.length) await database.insert(inventoryItems).values(stock);
  }

  it('counts more than 100 active products, ignoring inactive ones and other shops', async () => {
    const merchantId = await freshMerchant();
    const other = await freshMerchant();
    await seed(merchantId, [
      ...Array.from({ length: 130 }, () => ({ price: '1.00', quantity: 10 })),
      { price: '1.00', quantity: 10, active: false },
    ]);
    await seed(other, [{ price: '9.00', quantity: 1 }]);

    const summary = await repo.getSummary(merchantId);

    expect(summary.total).toBe(130);
    expect(summary.lowStockCount).toBe(0);
    expect(summary.stockValue.toDecimal()).toBe('1300.00');
  });

  it('applies the screen thresholds: up to 5 units, up to 2000 g, zero or no stock row is out', async () => {
    const merchantId = await freshMerchant();
    await seed(merchantId, [
      { price: '1.00', quantity: 6 }, // ok
      { price: '1.00', quantity: 5 }, // low
      { price: '1.00', quantity: 0 }, // out
      { price: '1.00' }, // no row: out
      { price: '1.00', quantity: -3 }, // negative: out, adds nothing to the value
      { price: '10.00', unit: 'KG', quantity: 2001 }, // ok
      { price: '10.00', unit: 'KG', quantity: 2000 }, // low
      { price: '10.00', unit: 'KG', quantity: 0 }, // out
    ]);

    const summary = await repo.getSummary(merchantId);

    expect(summary.total).toBe(8);
    expect(summary.lowStockCount).toBe(6);
    expect(summary.outOfStockCount).toBe(4);
  });

  it('gives the same stock value and restock count as the screen rule, cents and KG included', async () => {
    const merchantId = await freshMerchant();
    const rows: Seed[] = [
      { price: '19.99', quantity: 7 },
      { price: '0.01', unit: 'KG', quantity: 500 }, // 0.5 cent: half up to 1
      { price: '0.01', unit: 'KG', quantity: 499 }, // 0.499 cent: 0
      { price: '12.34', unit: 'KG', quantity: 1337 },
      { price: '3.49', unit: 'KG', quantity: 250 },
      { price: '7.77', unit: 'KG', quantity: 3 },
      { price: '1.0050', quantity: 3 }, // the API sends 1.01 (half up of 4 decimals)
      { price: '2.50', quantity: -4 },
      { price: '8.00' },
      ...Array.from({ length: 120 }, (_, i) => ({
        price: `${(i % 9) + 1}.${String((i * 7) % 100).padStart(2, '0')}`,
        unit: (i % 3 === 0 ? 'KG' : 'UN') as ProductUnit,
        quantity: (i * 37) % 3100,
      })),
    ];
    await seed(merchantId, rows);

    const summary = await repo.getSummary(merchantId);

    // What the screen holds: the items as GET /api/products sends them (price as Money.toDecimal()).
    const screenItems = rows.map((r) => ({
      salePrice: Number(Money.fromDecimal(r.price).toDecimal()),
      availableQuantity: r.quantity ?? 0,
      unit: r.unit,
    }));
    expect(summary.stockValue.toDecimal()).toBe(inventoryValue(screenItems).toFixed(2));
    expect(summary.lowStockCount).toBe(countNeedingRestock(screenItems));
  });

  it('is zero for a shop without products', async () => {
    const summary = await repo.getSummary(await freshMerchant());

    expect(summary).toMatchObject({ total: 0, lowStockCount: 0, outOfStockCount: 0 });
    expect(summary.stockValue.toDecimal()).toBe('0.00');
  });
});
