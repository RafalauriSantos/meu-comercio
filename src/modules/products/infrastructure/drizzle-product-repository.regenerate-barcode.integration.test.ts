import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { sales, saleItems } from '@/modules/sales/infrastructure/sales.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { products } from './products.schema';
import { DrizzleProductRepository } from './drizzle-product-repository';
import { InvalidBarcodeError, ProductChangedError } from '../domain/product-errors';
import { generateBarcode, isValidEan13 } from '../domain/generated-barcode';
import { BarcodeGenerationFailedError } from '../application/create-product.use-case';
import { UpdateProductUseCase } from '../application/update-product.use-case';

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

// random() yields the digits of `digits` one by one, then repeats the last one.
function digitsRandom(digits: string) {
  let i = 0;
  return () => Number(digits[Math.min(i++, digits.length - 1)]) / 10;
}

describe.skipIf(!TEST_DATABASE_URL)('UpdateProductUseCase generateBarcode (Postgres, D-24)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const repo = new DrizzleProductRepository();
  const useCase = new UpdateProductUseCase(repo);

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

  async function auditOf(id: string) {
    return database.select().from(auditEvents).where(eq(auditEvents.aggregateId, id));
  }

  it('replaces SEM-32354 by a generated EAN-13, audits it, and the old code stops matching', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-32354');

    const result = await useCase.execute(merchantId, 'dona', product.id, {
      generateBarcode: true,
      expectedUpdatedAt: product.updatedAt.toISOString(),
    });

    expect(result.barcode).toMatch(/^29\d{11}$/);
    expect(isValidEan13(result.barcode)).toBe(true);
    expect((await row(product.id)).barcode).toBe(result.barcode);
    expect(await repo.findByBarcode(merchantId, 'SEM-32354')).toBeNull();
    expect(await repo.findByBarcode(merchantId, result.barcode)).toMatchObject({ id: product.id });
    expect(result.updatedAt.getTime()).toBeGreaterThan(product.updatedAt.getTime());

    const events = await auditOf(product.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ merchantId, eventType: 'PRODUCT_UPDATED', actorId: 'dona', aggregateId: product.id });
    expect(events[0].details).toEqual({
      changes: { barcode: { from: 'SEM-32354', to: result.barcode } },
      barcodeGenerated: true,
    });
  });

  it('an old invalid barcode is read without error, and editing only the name leaves it as it is (D-30)', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'abc');

    expect(await repo.findByBarcode(merchantId, 'abc')).toMatchObject({ id: product.id, barcode: 'abc' });
    expect((await repo.searchByNameOrBarcode(merchantId, 'abc')).map((found) => found.barcode)).toEqual(['abc']);
    expect((await repo.listPage(merchantId, { query: '', page: 1, pageSize: 10, active: true })).items[0].product.barcode).toBe('abc');

    await useCase.execute(merchantId, 'dona', product.id, { name: 'Nome novo' });
    // Sending the same code again is not a change either.
    await useCase.execute(merchantId, 'dona', product.id, { barcode: 'abc', salePrice: '9.90' });

    const after = await row(product.id);
    expect(after).toMatchObject({ barcode: 'abc', name: 'Nome novo' });
  });

  it('refuses to change the barcode to an invalid one and leaves the product and the audit as they were (D-30)', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, '7891000100103');

    await expect(useCase.execute(merchantId, 'dona', product.id, { barcode: 'sdfbath', name: 'Nao grava' })).rejects.toBeInstanceOf(
      InvalidBarcodeError
    );

    expect(await row(product.id)).toMatchObject({ barcode: '7891000100103', name: 'Produto 7891000100103' });
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('a typed barcode edit is not flagged as generated', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'T1');

    await useCase.execute(merchantId, 'dona', product.id, { barcode: '7891000200209' });

    const [event] = await auditOf(product.id);
    expect(event.details).toEqual({ changes: { barcode: { from: 'T1', to: '7891000200209' } } });
  });

  it('on collision (active and inactive product of the shop) draws again until a free code', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-1');
    // The first draw (ten zeros) is held by an inactive product, the second (ten ones) by an active one.
    const zeros = generateBarcode(digitsRandom('0'));
    const ones = generateBarcode(digitsRandom('1'));
    const first = await seed(merchantId, zeros, { active: false });
    const second = await seed(merchantId, ones);
    const controlled = new UpdateProductUseCase(repo, digitsRandom('0000000000' + '1111111111' + '2222222222'));

    const result = await controlled.execute(merchantId, 'dona', product.id, { generateBarcode: true });

    expect(result.barcode.startsWith('292222222222')).toBe(true);
    expect(isValidEan13(result.barcode)).toBe(true);
    expect((await row(first.id)).barcode).toBe(zeros);
    expect((await row(second.id)).barcode).toBe(ones);
    expect(await auditOf(product.id)).toHaveLength(1);
  });

  it('the same generated code in another shop is not a conflict', async () => {
    const mine = await freshMerchant();
    const other = await freshMerchant();
    const product = await seed(mine, 'SEM-2');
    const zeros = generateBarcode(digitsRandom('0'));
    await seed(other, zeros);
    const controlled = new UpdateProductUseCase(repo, digitsRandom('0'));

    const result = await controlled.execute(mine, 'dona', product.id, { generateBarcode: true });

    expect(result.barcode).toBe(zeros);
  });

  it('after 5 collisions fails with the generic error, writes nothing and audits nothing', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-3');
    await seed(merchantId, generateBarcode(digitsRandom('0')));
    const controlled = new UpdateProductUseCase(repo, digitsRandom('0'));

    await expect(controlled.execute(merchantId, 'dona', product.id, { generateBarcode: true })).rejects.toBeInstanceOf(
      BarcodeGenerationFailedError
    );

    expect(await row(product.id)).toEqual(product);
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('a stale expectedUpdatedAt is refused: code unchanged, no audit', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-4');
    const stale = new Date(product.updatedAt.getTime() - 5000).toISOString();

    await expect(
      useCase.execute(merchantId, 'dona', product.id, { generateBarcode: true, expectedUpdatedAt: stale })
    ).rejects.toBeInstanceOf(ProductChangedError);

    expect(await row(product.id)).toEqual(product);
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('racing with a name edit from the same state: one wins, the other is warned, nothing is overwritten', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-5');
    const expectedUpdatedAt = product.updatedAt.toISOString();

    const results = await Promise.allSettled([
      useCase.execute(merchantId, 'dona', product.id, { generateBarcode: true, expectedUpdatedAt }),
      useCase.execute(merchantId, 'dona', product.id, { name: 'Nome editado', expectedUpdatedAt }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ProductChangedError);
    const after = await row(product.id);
    // Exactly one of the two edits landed.
    const barcodeChanged = after.barcode !== 'SEM-5';
    const nameChanged = after.name === 'Nome editado';
    expect(barcodeChanged).not.toBe(nameChanged);
    expect(await auditOf(product.id)).toHaveLength(1);
  });

  it('a product of another shop is not found and not changed', async () => {
    const mine = await freshMerchant();
    const other = await freshMerchant();
    const theirs = await seed(other, 'SEM-6');

    await expect(useCase.execute(mine, 'dona', theirs.id, { generateBarcode: true })).rejects.toThrow('Produto não encontrado.');

    expect(await row(theirs.id)).toEqual(theirs);
  });

  it('keeps sales, sale items and stock movements linked to the same product', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SEM-7');
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'dona', openingBalance: '0' })
      .returning();
    const [sale] = await database
      .insert(sales)
      .values({ merchantId, cashSessionId: session.id, operatorId: 'dona', subtotal: '24.9000', total: '24.9000' })
      .returning();
    await database.insert(saleItems).values({
      merchantId,
      saleId: sale.id,
      productId: product.id,
      productName: product.name,
      unitPrice: '24.9000',
      quantity: 1,
      unit: 'UN',
      subtotal: '24.9000',
    });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 5 });
    await database.insert(inventoryMovements).values({
      merchantId,
      productId: product.id,
      movementType: 'RESTOCK',
      quantity: 5,
      reason: 'Estoque inicial',
      actorId: 'dona',
    });
    const snapshot = async () => ({
      items: await database.select().from(saleItems).where(eq(saleItems.productId, product.id)),
      stock: await database.select().from(inventoryItems).where(eq(inventoryItems.productId, product.id)),
      movements: await database.select().from(inventoryMovements).where(eq(inventoryMovements.productId, product.id)),
    });
    const before = await snapshot();

    await useCase.execute(merchantId, 'dona', product.id, { generateBarcode: true });

    expect(await snapshot()).toEqual(before);
    expect(before.items).toHaveLength(1);
    expect(before.movements).toHaveLength(1);
  });
});
