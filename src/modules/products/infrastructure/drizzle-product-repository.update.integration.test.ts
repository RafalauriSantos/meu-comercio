import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { sales, saleItems } from '@/modules/sales/infrastructure/sales.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { Money } from '@/shared/domain/money';
import { products } from './products.schema';
import { DrizzleProductRepository } from './drizzle-product-repository';
import { ProductBarcodeConflictError, ProductChangedError } from '../domain/product-errors';

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

describe.skipIf(!TEST_DATABASE_URL)('DrizzleProductRepository.updateDetails (Postgres)', () => {
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

  async function seed(
    merchantId: string,
    barcode: string,
    extra: Partial<typeof products.$inferInsert> = {}
  ) {
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

  const ACTOR = { actorId: 'dona' };

  it('a partial update changes only what was sent and keeps unit, active and created_at', async () => {
    const merchantId = await freshMerchant();
    const before = await seed(merchantId, 'A1', { unit: 'KG' });

    const result = await repo.updateDetails(merchantId, before.id, { name: 'Arroz Novo' }, ACTOR);

    const after = await row(before.id);
    expect(result?.name).toBe('Arroz Novo');
    expect(after.name).toBe('Arroz Novo');
    expect(after.barcode).toBe('A1');
    expect(after.salePrice).toBe(before.salePrice);
    expect(after.unit).toBe('KG');
    expect(after.active).toBe(true);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('changes the price through Money and the response carries it', async () => {
    const merchantId = await freshMerchant();
    const before = await seed(merchantId, 'A1');

    const result = await repo.updateDetails(merchantId, before.id, { salePrice: Money.fromDecimal('12.50') }, ACTOR);

    expect(result?.salePrice.toDecimal()).toBe(Money.fromDecimal('12.50').toDecimal());
    expect((await row(before.id)).salePrice).toBe('12.5000');
  });

  it('a new free barcode changes the product, frees the old one and keeps the row count', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'OLD');
    const countBefore = (await database.select().from(products).where(eq(products.merchantId, merchantId))).length;

    await repo.updateDetails(merchantId, product.id, { barcode: 'NEW' }, ACTOR);

    expect(await repo.findByBarcode(merchantId, 'NEW')).toMatchObject({ id: product.id });
    expect(await repo.findByBarcode(merchantId, 'OLD')).toBeNull();
    const countAfter = (await database.select().from(products).where(eq(products.merchantId, merchantId))).length;
    expect(countAfter).toBe(countBefore);
    // The old code is free again for another product.
    await expect(seed(merchantId, 'OLD')).resolves.toBeDefined();
  });

  it('a barcode used by another product (active or inactive) is a conflict and changes nobody', async () => {
    const merchantId = await freshMerchant();
    const mine = await seed(merchantId, 'MINE');
    const active = await seed(merchantId, 'TAKEN', { name: 'Outro ativo' });
    const inactive = await seed(merchantId, 'TAKEN-OFF', { name: 'Outro inativo', active: false });

    for (const taken of ['TAKEN', 'TAKEN-OFF']) {
      await expect(
        repo.updateDetails(merchantId, mine.id, { name: 'Nome que nao deve gravar', barcode: taken }, ACTOR)
      ).rejects.toBeInstanceOf(ProductBarcodeConflictError);
    }

    expect(await row(mine.id)).toEqual(mine);
    expect(await row(active.id)).toEqual(active);
    expect(await row(inactive.id)).toEqual(inactive);
    expect(await auditOf(mine.id)).toHaveLength(0);
  });

  it('two edits racing for the same new barcode: one wins, the other is a domain conflict, nobody is overwritten', async () => {
    const merchantId = await freshMerchant();
    const a = await seed(merchantId, 'RA');
    const b = await seed(merchantId, 'RB');

    const results = await Promise.allSettled([
      repo.updateDetails(merchantId, a.id, { barcode: 'RACE' }, ACTOR),
      repo.updateDetails(merchantId, b.id, { barcode: 'RACE' }, ACTOR),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ProductBarcodeConflictError);
    const barcodes = [(await row(a.id)).barcode, (await row(b.id)).barcode];
    expect(barcodes.filter((code) => code === 'RACE')).toHaveLength(1);
    expect(barcodes.filter((code) => code === 'RA' || code === 'RB')).toHaveLength(1);
  });

  it('the same barcode as the product itself is not a conflict', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'SAME');

    const result = await repo.updateDetails(merchantId, product.id, { barcode: 'SAME', name: 'Novo nome' }, ACTOR);

    expect(result?.name).toBe('Novo nome');
    const [event] = await auditOf(product.id);
    expect(event.details).toEqual({ changes: { name: { from: 'Produto SAME', to: 'Novo nome' } } });
  });

  it('a product of another shop is not found and not changed', async () => {
    const mine = await freshMerchant();
    const other = await freshMerchant();
    const theirs = await seed(other, 'T1');

    const result = await repo.updateDetails(mine, theirs.id, { name: 'Invadido' }, ACTOR);

    expect(result).toBeNull();
    expect(await row(theirs.id)).toEqual(theirs);
    expect(await auditOf(theirs.id)).toHaveLength(0);
  });

  it('a product that does not exist is not found', async () => {
    const merchantId = await freshMerchant();
    expect(
      await repo.updateDetails(merchantId, '99999999-9999-4999-8999-999999999999', { name: 'Nada' }, ACTOR)
    ).toBeNull();
  });

  it('the same barcode may exist in two shops: editing one does not touch the other', async () => {
    const mine = await freshMerchant();
    const other = await freshMerchant();
    const a = await seed(mine, 'X1');
    const b = await seed(other, 'X2');

    await repo.updateDetails(mine, a.id, { barcode: 'X2' }, ACTOR);

    expect((await row(a.id)).barcode).toBe('X2');
    expect(await row(b.id)).toEqual(b);
  });

  it('the unit and the stock never change', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'U1', { unit: 'KG' });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 1500 });

    await repo.updateDetails(
      merchantId,
      product.id,
      // The type refuses these fields; the cast simulates a caller that ignores it.
      { name: 'Queijo', unit: 'UN', active: false } as never,
      ACTOR
    );

    const after = await row(product.id);
    expect(after.unit).toBe('KG');
    expect(after.active).toBe(true);
    const [stock] = await database.select().from(inventoryItems).where(eq(inventoryItems.productId, product.id));
    expect(stock.availableQuantity).toBe(1500);
  });

  it('an old expectedUpdatedAt is a conflict and writes nothing', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'C1');
    const stale = new Date(product.updatedAt.getTime() - 5000);

    await expect(
      repo.updateDetails(merchantId, product.id, { name: 'Tarde demais' }, { ...ACTOR, expectedUpdatedAt: stale })
    ).rejects.toBeInstanceOf(ProductChangedError);

    expect(await row(product.id)).toEqual(product);
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('a current expectedUpdatedAt writes; then the same value is old and conflicts (A saves, B is warned)', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'C2');
    const expectedUpdatedAt = product.updatedAt;

    await repo.updateDetails(merchantId, product.id, { name: 'Edição da A' }, { ...ACTOR, expectedUpdatedAt });
    await expect(
      repo.updateDetails(merchantId, product.id, { name: 'Edição da B' }, { ...ACTOR, expectedUpdatedAt })
    ).rejects.toBeInstanceOf(ProductChangedError);

    expect((await row(product.id)).name).toBe('Edição da A');
  });

  it('two simultaneous edits from the same state: one wins and the other is warned', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'C3');
    const expectedUpdatedAt = product.updatedAt;

    const results = await Promise.allSettled([
      repo.updateDetails(merchantId, product.id, { name: 'Edição 1' }, { ...ACTOR, expectedUpdatedAt }),
      repo.updateDetails(merchantId, product.id, { name: 'Edição 2' }, { ...ACTOR, expectedUpdatedAt }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ProductChangedError);
    expect(['Edição 1', 'Edição 2']).toContain((await row(product.id)).name);
    expect(await auditOf(product.id)).toHaveLength(1);
  });

  it('without expectedUpdatedAt the last write wins and the audit keeps both changes', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'C4');

    await repo.updateDetails(merchantId, product.id, { name: 'Primeiro' }, ACTOR);
    await repo.updateDetails(merchantId, product.id, { name: 'Segundo' }, ACTOR);

    expect((await row(product.id)).name).toBe('Segundo');
    expect(await auditOf(product.id)).toHaveLength(2);
  });

  it('nothing changed: returns the product, writes no audit and keeps updated_at', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'N1');

    const result = await repo.updateDetails(
      merchantId,
      product.id,
      { name: product.name, barcode: 'N1', salePrice: Money.fromDecimal('24.9') },
      ACTOR
    );

    expect(result?.id).toBe(product.id);
    expect(await row(product.id)).toEqual(product);
    expect(await auditOf(product.id)).toHaveLength(0);
  });

  it('records exactly one PRODUCT_UPDATED with from and to of only the changed fields', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'AU1', { name: 'Arroz' });

    await repo.updateDetails(
      merchantId,
      product.id,
      { name: 'Arroz Tio João', salePrice: Money.fromDecimal('26.5'), barcode: 'AU1' },
      { actorId: 'tatiane' }
    );

    const events = await auditOf(product.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      merchantId,
      eventType: 'PRODUCT_UPDATED',
      actorId: 'tatiane',
      aggregateType: 'PRODUCT',
      aggregateId: product.id,
    });
    expect(events[0].details).toEqual({
      changes: {
        name: { from: 'Arroz', to: 'Arroz Tio João' },
        salePrice: { from: '24.90', to: '26.50' },
      },
    });
  });

  it('if the audit fails the product stays as it was (one transaction)', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'AT1');

    // actor_id is varchar(120): a longer value makes the audit insert fail after the product update.
    await expect(
      repo.updateDetails(merchantId, product.id, { name: 'Não deve ficar' }, { actorId: 'x'.repeat(200) })
    ).rejects.toThrow();

    expect(await row(product.id)).toEqual(product);
  });

  it('an old sale keeps the name, unit price and subtotal after the product is edited', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'S1', { name: 'Arroz', salePrice: '10.0000' });
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'dona', openingBalance: '0' })
      .returning();
    const [sale] = await database
      .insert(sales)
      .values({ merchantId, cashSessionId: session.id, operatorId: 'dona', subtotal: '20.0000', total: '20.0000' })
      .returning();
    await database.insert(saleItems).values({
      merchantId,
      saleId: sale.id,
      productId: product.id,
      productName: 'Arroz',
      unitPrice: '10.0000',
      quantity: 2,
      unit: 'UN',
      subtotal: '20.0000',
    });
    const itemsOf = () => database.select().from(saleItems).where(and(eq(saleItems.saleId, sale.id)));
    const before = await itemsOf();

    await repo.updateDetails(
      merchantId,
      product.id,
      { name: 'Arroz Tio João', salePrice: Money.fromDecimal('12.50'), barcode: 'S1-NEW' },
      ACTOR
    );

    expect(await itemsOf()).toEqual(before);
    expect((await row(product.id)).salePrice).toBe('12.5000');
  });

  it('refuses a zero or negative price and writes nothing', async () => {
    const merchantId = await freshMerchant();
    const product = await seed(merchantId, 'Z1');

    await expect(
      repo.updateDetails(merchantId, product.id, { salePrice: Money.fromDecimal('0') }, ACTOR)
    ).rejects.toThrow('maior que zero');
    await expect(
      repo.updateDetails(merchantId, product.id, { salePrice: Money.fromDecimal('-3') }, ACTOR)
    ).rejects.toThrow();

    expect(await row(product.id)).toEqual(product);
    expect(await auditOf(product.id)).toHaveLength(0);
  });
});
