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
import type { ProductImportItem } from '../domain/product-import-store.port';

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

  const createAll = (store: DrizzleProductImportStore<typeof schema>, merchantId: string, create: ProductImportItem[]) =>
    store.importAll(merchantId, 'dona', { create, correct: [] });

  async function seed(merchantId: string, barcode: string, extra: Partial<typeof products.$inferInsert> = {}) {
    const [row] = await database
      .insert(products)
      .values({ merchantId, barcode, name: `Produto ${barcode}`, salePrice: '24.9000', ...extra })
      .returning();
    return row;
  }

  async function row(id: string) {
    const [found] = await database.select().from(products).where(eq(products.id, id));
    return found;
  }

  async function eventsOf(id: string) {
    return database.select().from(auditEvents).where(eq(auditEvents.aggregateId, id));
  }

  it('creates the products with their stock, movement and audit trail', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();

    await createAll(store, merchantId, [
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

    await createAll(store, merchantId, [
      { barcode: '4001', name: 'Queijo Mussarela', salePrice: '42.90', unit: 'KG', initialStock: 2500 },
    ]);

    const [created] = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(created.unit).toBe('KG');
    const [stock] = await database.select().from(inventoryItems).where(eq(inventoryItems.productId, created.id));
    expect(stock.availableQuantity).toBe(2500);
  });

  it('creates none of them when one fails (a barcode that already exists)', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();
    await createAll(store, merchantId, [{ barcode: '2001', name: 'Sal', salePrice: '3.00', unit: 'UN', initialStock: 1 }]);

    await expect(
      createAll(store, merchantId, [
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

  it('finds the products of the merchant by barcode, active or deleted, and only its own', async () => {
    const store = new DrizzleProductImportStore(database);
    const merchantId = await freshMerchant();
    const other = await freshMerchant();
    await seed(merchantId, '3001', { name: 'Café', salePrice: '12.5000' });
    await seed(merchantId, '3004', { name: 'Excluído', unit: 'KG', active: false });
    await seed(other, '3002', { name: 'Leite' });

    const found = await store.findProductsByBarcodes(merchantId, ['3001', '3002', '3003', '3004']);

    expect([...found.keys()].sort()).toEqual(['3001', '3004']);
    expect(found.get('3001')).toEqual({ barcode: '3001', name: 'Café', salePrice: '12.50', unit: 'UN', active: true });
    expect(found.get('3004')).toMatchObject({ unit: 'KG', active: false });
    expect((await store.findProductsByBarcodes(merchantId, [])).size).toBe(0);
  });

  describe('corrections', () => {
    it('writes the new name and price, advances updated_at, keeps unit, stock and active, and audits PRODUCT_UPDATED as the D-20 does', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5001', { name: 'arroz', salePrice: '24.9000', unit: 'KG' });

      const outcomes = await store.importAll(merchantId, 'dona', {
        create: [],
        correct: [{ barcode: '5001', name: 'Arroz Tipo 1', salePrice: '26.50' }],
      });

      expect(outcomes).toEqual([
        {
          barcode: '5001',
          outcome: 'corrected',
          before: { name: 'arroz', salePrice: '24.90' },
          after: { name: 'Arroz Tipo 1', salePrice: '26.50' },
        },
      ]);
      const after = await row(product.id);
      expect(after).toMatchObject({ name: 'Arroz Tipo 1', unit: 'KG', active: true, barcode: '5001' });
      expect(Number(after.salePrice)).toBe(26.5);
      expect(after.updatedAt.getTime()).toBeGreaterThan(product.updatedAt.getTime());
      expect(after.createdAt.getTime()).toBe(product.createdAt.getTime());

      const events = await eventsOf(product.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ eventType: 'PRODUCT_UPDATED', actorId: 'dona', aggregateType: 'PRODUCT', merchantId });
      expect(events[0].details).toEqual({
        changes: { name: { from: 'arroz', to: 'Arroz Tipo 1' }, salePrice: { from: '24.90', to: '26.50' } },
        source: 'import',
      });
    });

    it('audits only the field that changed', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5002', { name: 'Sal', salePrice: '3.0000' });

      await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5002', name: 'Sal', salePrice: '3.50' }] });

      const [event] = await eventsOf(product.id);
      expect(event.details).toEqual({ changes: { salePrice: { from: '3.00', to: '3.50' } }, source: 'import' });
    });

    it('with no price in the correction only the name changes and the price stays', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5003', { name: 'sal', salePrice: '3.0000' });

      await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5003', name: 'Sal' }] });

      const after = await row(product.id);
      expect(after.name).toBe('Sal');
      expect(Number(after.salePrice)).toBe(3);
      const [event] = await eventsOf(product.id);
      expect(event.details).toEqual({ changes: { name: { from: 'sal', to: 'Sal' } }, source: 'import' });
    });

    it('writes nothing for a product equal to the sheet: no event, same updated_at', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5004', { name: 'Sal', salePrice: '3.0000' });

      const outcomes = await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5004', name: 'Sal', salePrice: '3.00' }] });

      expect(outcomes).toEqual([{ barcode: '5004', outcome: 'unchanged' }]);
      expect((await row(product.id)).updatedAt.getTime()).toBe(product.updatedAt.getTime());
      expect(await eventsOf(product.id)).toEqual([]);
    });

    it('the sheet wins over a product edited after the preview, and the audit keeps the real "before"', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5005', { name: 'Nome da prévia', salePrice: '10.0000' });
      // Someone edits it between the preview and the confirmation.
      await database.update(products).set({ name: 'Editado por outra pessoa', salePrice: '12.0000' }).where(eq(products.id, product.id));

      const outcomes = await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5005', name: 'Planilha', salePrice: '11.00' }] });

      expect(outcomes[0]).toMatchObject({
        outcome: 'corrected',
        before: { name: 'Editado por outra pessoa', salePrice: '12.00' },
        after: { name: 'Planilha', salePrice: '11.00' },
      });
      const [event] = await eventsOf(product.id);
      expect(event.details).toEqual({
        changes: { name: { from: 'Editado por outra pessoa', to: 'Planilha' }, salePrice: { from: '12.00', to: '11.00' } },
        source: 'import',
      });
    });

    it('counts as unchanged a product that already became equal to the sheet meanwhile', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5006', { name: 'Planilha', salePrice: '11.0000' });

      const outcomes = await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5006', name: 'Planilha', salePrice: '11.00' }] });

      expect(outcomes).toEqual([{ barcode: '5006', outcome: 'unchanged' }]);
      expect(await eventsOf(product.id)).toEqual([]);
    });

    it('ignores a deleted product: not corrected, not restored, not recreated, no event', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5007', { name: 'Velho', salePrice: '5.0000', active: false });

      const outcomes = await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5007', name: 'Novo', salePrice: '9.00' }] });

      expect(outcomes).toEqual([{ barcode: '5007', outcome: 'ignored' }]);
      const after = await row(product.id);
      expect(after).toMatchObject({ name: 'Velho', active: false });
      expect(Number(after.salePrice)).toBe(5);
      expect(after.updatedAt.getTime()).toBe(product.updatedAt.getTime());
      expect(await eventsOf(product.id)).toEqual([]);
      expect(await database.select().from(products).where(eq(products.merchantId, merchantId))).toHaveLength(1);
    });

    it('never touches a product of another merchant with the same barcode', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const other = await freshMerchant();
      const mine = await seed(merchantId, '5008', { name: 'Minha', salePrice: '5.0000' });
      const theirs = await seed(other, '5008', { name: 'Deles', salePrice: '7.0000' });

      await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5008', name: 'Corrigida', salePrice: '6.00' }] });

      expect((await row(mine.id)).name).toBe('Corrigida');
      const untouched = await row(theirs.id);
      expect(untouched.name).toBe('Deles');
      expect(Number(untouched.salePrice)).toBe(7);
      expect(await eventsOf(theirs.id)).toEqual([]);
    });

    it('never writes a zero price over a price above zero, only the name', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5009', { name: 'sal', salePrice: '3.0000' });

      await store.importAll(merchantId, 'dona', { create: [], correct: [{ barcode: '5009', name: 'Sal', salePrice: '0.00' }] });

      const after = await row(product.id);
      expect(after.name).toBe('Sal');
      expect(Number(after.salePrice)).toBe(3);
    });

    it('creations and corrections are one transaction: a failed creation undoes the corrections', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const product = await seed(merchantId, '5010', { name: 'Velho', salePrice: '5.0000' });
      await seed(merchantId, '5011', { name: 'Já existe', salePrice: '1.0000' });

      await expect(
        store.importAll(merchantId, 'dona', {
          create: [{ barcode: '5011', name: 'Colide', salePrice: '2.00', unit: 'UN', initialStock: 0 }],
          correct: [{ barcode: '5010', name: 'Novo', salePrice: '9.00' }],
        })
      ).rejects.toThrow();

      const after = await row(product.id);
      expect(after.name).toBe('Velho');
      expect(Number(after.salePrice)).toBe(5);
      expect(await eventsOf(product.id)).toEqual([]);
    });

    it('two confirmations of the same sheet at the same time give the result of one, with one event per product', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      const ids: string[] = [];
      for (let i = 0; i < 20; i += 1) ids.push((await seed(merchantId, `60${i}`, { name: `velho ${i}`, salePrice: '5.0000' })).id);
      const batch = { create: [], correct: Array.from({ length: 20 }, (_, i) => ({ barcode: `60${i}`, name: `Novo ${i}`, salePrice: '6.00' })) };

      const [first, second] = await Promise.all([store.importAll(merchantId, 'dona', batch), store.importAll(merchantId, 'dona', batch)]);

      const outcomes = [...first, ...second].map((o) => o.outcome);
      expect(outcomes.filter((o) => o === 'corrected')).toHaveLength(20);
      expect(outcomes.filter((o) => o === 'unchanged')).toHaveLength(20);
      for (const id of ids) {
        expect(await eventsOf(id)).toHaveLength(1);
      }
    });

    it('corrects a thousand products in one go', async () => {
      const store = new DrizzleProductImportStore(database);
      const merchantId = await freshMerchant();
      await database.insert(products).values(
        Array.from({ length: 1000 }, (_, i) => ({ merchantId, barcode: `7${String(i).padStart(5, '0')}`, name: `velho ${i}`, salePrice: '5.0000' }))
      );

      const outcomes = await store.importAll(merchantId, 'dona', {
        create: [],
        correct: Array.from({ length: 1000 }, (_, i) => ({ barcode: `7${String(i).padStart(5, '0')}`, name: `Novo ${i}`, salePrice: '6.50' })),
      });

      expect(outcomes.every((o) => o.outcome === 'corrected')).toBe(true);
      const events = await database.select().from(auditEvents).where(eq(auditEvents.merchantId, merchantId));
      expect(events).toHaveLength(1000);
    }, 30_000);
  });
});
