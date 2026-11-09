import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { sales, saleItems } from './sales.schema';
import { DrizzleRecentSalesReader } from './drizzle-recent-sales-reader';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// 9 Nov 2026 in Brasília: from 03:00 UTC to 03:00 UTC of the next day (the end is not included).
const START = new Date('2026-11-09T03:00:00Z');
const END = new Date('2026-11-10T03:00:00Z');

describe.skipIf(!TEST_DATABASE_URL)('DrizzleRecentSalesReader (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let reader: DrizzleRecentSalesReader<typeof schema>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    reader = new DrizzleRecentSalesReader(database);
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedShop() {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId: merchant.id, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const [rice] = await database
      .insert(products)
      .values({ merchantId: merchant.id, barcode: '1', name: 'Arroz 5kg', salePrice: '25.50' })
      .returning({ id: products.id });
    const [beans] = await database
      .insert(products)
      .values({ merchantId: merchant.id, barcode: '2', name: 'Feijão 1kg', salePrice: '8.75' })
      .returning({ id: products.id });
    return { merchantId: merchant.id, cashSessionId: session.id, riceId: rice.id, beansId: beans.id };
  }

  type Shop = Awaited<ReturnType<typeof seedShop>>;

  async function addSale(shop: Shop, status: string, total: string, at: string, itemProductIds: Array<[string, string]> = []) {
    const [row] = await database
      .insert(sales)
      .values({
        merchantId: shop.merchantId,
        cashSessionId: shop.cashSessionId,
        operatorId: 'tatiane',
        status,
        subtotal: total,
        total,
        createdAt: new Date(at),
      })
      .returning({ id: sales.id });
    for (const [productId, name] of itemProductIds) {
      await database.insert(saleItems).values({
        merchantId: shop.merchantId,
        saleId: row.id,
        productId,
        productName: name,
        unitPrice: '1.00',
        quantity: 1,
        subtotal: '1.00',
      });
    }
    return row.id;
  }

  it('lists the confirmed sales of the window, newest first, each with the names of what was sold', async () => {
    const shop = await seedShop();
    const older = await addSale(shop, 'CONFIRMED', '59.75', '2026-11-09T15:00:00Z', [
      [shop.riceId, 'Arroz 5kg'],
      [shop.beansId, 'Feijão 1kg'],
    ]);
    // 22:00 in Brasília is already the 10th in UTC, but it is still the 9th at the shop.
    const newer = await addSale(shop, 'CONFIRMED', '8.75', '2026-11-10T01:00:00Z', [[shop.beansId, 'Feijão 1kg']]);

    const list = await reader.listConfirmed(shop.merchantId, START, END, 30);

    expect(list.map((sale) => sale.id)).toEqual([newer, older]);
    expect(list[0]).toMatchObject({ total: '8.75', operatorId: 'tatiane', items: 'Feijão 1kg' });
    expect(list[1]).toMatchObject({ total: '59.75', items: 'Arroz 5kg, Feijão 1kg' });
  });

  it('leaves out the cancelled sales, the ones outside the window and the ones of another shop', async () => {
    const shop = await seedShop();
    const other = await seedShop();
    const kept = await addSale(shop, 'CONFIRMED', '10.00', '2026-11-09T12:00:00Z');
    await addSale(shop, 'CANCELLED', '20.00', '2026-11-09T13:00:00Z');
    await addSale(shop, 'CONFIRMED', '30.00', '2026-11-10T03:00:00Z');
    await addSale(shop, 'CONFIRMED', '40.00', '2026-11-09T02:59:59Z');
    await addSale(other, 'CONFIRMED', '999.00', '2026-11-09T12:00:00Z');

    const list = await reader.listConfirmed(shop.merchantId, START, END, 30);

    expect(list.map((sale) => sale.id)).toEqual([kept]);
  });

  it('shows a sale with no items as an empty text, and honors the limit', async () => {
    const shop = await seedShop();
    for (let hour = 10; hour < 15; hour += 1) {
      await addSale(shop, 'CONFIRMED', '1.00', `2026-11-09T${hour}:00:00Z`);
    }

    const list = await reader.listConfirmed(shop.merchantId, START, END, 3);

    expect(list).toHaveLength(3);
    expect(list.map((sale) => sale.items)).toEqual(['', '', '']);
    expect(list[0].createdAt.toISOString()).toBe('2026-11-09T14:00:00.000Z');
  });
});
