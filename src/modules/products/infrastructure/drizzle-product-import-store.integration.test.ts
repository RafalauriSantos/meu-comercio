import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { products } from './products.schema';
import { DrizzleProductImportStore } from './drizzle-product-import-store';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleProductImportStore (Postgres)', () => {
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

  it('creates the products with their stock, movement and audit trail', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();

    await store.importAll(merchantId, 'dona', [
      { barcode: '1001', name: 'Arroz 5kg', salePrice: '24.90', unit: 'UN', initialStock: 12 },
      { barcode: '1002', name: 'Feijão 1kg', salePrice: '8.50', unit: 'UN', initialStock: 0 },
    ]);

    const created = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(created.map((p) => [p.barcode, p.name, Number(p.salePrice), p.active]).sort()).toEqual([
      ['1001', 'Arroz 5kg', 24.9, true],
      ['1002', 'Feijão 1kg', 8.5, true],
    ]);

    const rice = created.find((p) => p.barcode === '1001')!;
    const [stock] = await database
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, rice.id)));
    expect(stock.availableQuantity).toBe(12);

    const movements = await database.select().from(inventoryMovements).where(eq(inventoryMovements.merchantId, merchantId));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ movementType: 'RESTOCK', quantity: 12, actorId: 'dona' });

    const events = await database.select().from(auditEvents).where(eq(auditEvents.merchantId, merchantId));
    expect(events.filter((e) => e.eventType === 'PRODUCT_CREATED')).toHaveLength(2);
    expect(events.filter((e) => e.eventType === 'INVENTORY_RESTOCKED')).toHaveLength(1);
  });

  it('keeps the unit: a product sold by weight has its stock in grams', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();

    await store.importAll(merchantId, 'dona', [
      { barcode: '4001', name: 'Queijo Mussarela', salePrice: '42.90', unit: 'KG', initialStock: 2500 },
    ]);

    const [row] = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(row.unit).toBe('KG');
    const [stock] = await database.select().from(inventoryItems).where(eq(inventoryItems.productId, row.id));
    expect(stock.availableQuantity).toBe(2500);
  });

  it('creates none of them when one fails (a barcode that already exists)', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();
    await store.importAll(merchantId, 'dona', [{ barcode: '2001', name: 'Sal', salePrice: '3.00', unit: 'UN', initialStock: 1 }]);

    await expect(
      store.importAll(merchantId, 'dona', [
        { barcode: '2002', name: 'Açúcar', salePrice: '5.00', unit: 'UN', initialStock: 4 },
        { barcode: '2001', name: 'Sal de novo', salePrice: '9.00', unit: 'UN', initialStock: 9 },
      ])
    ).rejects.toThrow();

    const rows = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(rows.map((p) => p.barcode)).toEqual(['2001']);
    expect(Number(rows[0].salePrice)).toBe(3);
    const movements = await database.select().from(inventoryMovements).where(eq(inventoryMovements.merchantId, merchantId));
    expect(movements).toHaveLength(1);
  });

  it('tells which barcodes the merchant already has, and only its own', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();
    const other = await freshMerchant();
    await store.importAll(merchantId, 'dona', [{ barcode: '3001', name: 'Café', salePrice: '12.00', unit: 'UN', initialStock: 0 }]);
    await store.importAll(other, 'dona', [{ barcode: '3002', name: 'Leite', salePrice: '5.00', unit: 'UN', initialStock: 0 }]);

    const found = await store.findExistingBarcodes(merchantId, ['3001', '3002', '3003']);

    expect([...found]).toEqual(['3001']);
    expect((await store.findExistingBarcodes(merchantId, [])).size).toBe(0);
  });
});
