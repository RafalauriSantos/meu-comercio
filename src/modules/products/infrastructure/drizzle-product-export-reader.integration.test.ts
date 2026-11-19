import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { products } from './products.schema';
import { DrizzleProductExportReader } from './drizzle-product-export-reader';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleProductExportReader (Postgres)', () => {
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

  async function freshMerchant(): Promise<string> {
    const [row] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    return row.id;
  }

  async function seed(merchantId: string, barcode: string, extra: Partial<typeof products.$inferInsert> = {}, stock?: number) {
    const [row] = await database
      .insert(products)
      .values({ merchantId, barcode, name: `Produto ${barcode}`, salePrice: '24.9000', ...extra })
      .returning();
    if (stock !== undefined) await database.insert(inventoryItems).values({ merchantId, productId: row.id, availableQuantity: stock });
    return row;
  }

  it('lists only the active products of the shop, with price, unit and stock (0 without a stock row)', async () => {
    const reader = new DrizzleProductExportReader(database);
    const merchantId = await freshMerchant();
    const other = await freshMerchant();
    await seed(merchantId, '1001', { name: 'Arroz' }, 12);
    await seed(merchantId, '1002', { name: 'Queijo', unit: 'KG', salePrice: '42.9000' }, 2500);
    await seed(merchantId, '1003', { name: 'Sem estoque' });
    await seed(merchantId, '1004', { name: 'Excluído', active: false }, 5);
    await seed(other, '2001', { name: 'De outra loja' }, 1);

    const rows = await reader.listActive(merchantId);

    expect(
      rows.map((r) => [r.barcode, r.name, r.salePrice.toDecimal(), r.unit, r.availableQuantity]).sort()
    ).toEqual([
      ['1001', 'Arroz', '24.90', 'UN', 12],
      ['1002', 'Queijo', '42.90', 'KG', 2500],
      ['1003', 'Sem estoque', '24.90', 'UN', 0],
    ]);
  });

  it('writes nothing', async () => {
    const reader = new DrizzleProductExportReader(database);
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, '3001', {}, 4);

    await reader.listActive(merchantId);

    const [after] = await database.select().from(products);
    expect(after).toBeDefined();
    const events = await database.select().from(auditEvents);
    expect(events.filter((e) => e.aggregateId === product.id)).toHaveLength(0);
  });
});
