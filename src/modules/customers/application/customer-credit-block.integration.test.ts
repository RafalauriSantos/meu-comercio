import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';

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

import { merchants, appUsers, userAuthorities } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions, cashMovements } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger, ownerPinAttempts } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import { Money } from '@/shared/domain/money';
import { CustomerCreditBlockedError } from '../domain/errors';
import { CreateSaleUseCase } from '@/modules/sales/application/create-sale.use-case';
import type { SaleCommit, SaleRepository } from '@/modules/sales/domain/sale-repository.port';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleCustomerRepository } from '../infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '../infrastructure/drizzle-customer-credit-repository';
import { BcryptOwnerPinVerifier } from '../infrastructure/bcrypt-owner-pin-verifier';
import { DrizzleDebtSettlementRepository } from '../infrastructure/drizzle-debt-settlement-repository';
import { UpdateCustomerUseCase } from './update-customer.use-case';
import { SettleCustomerDebtUseCase } from './settle-customer-debt.use-case';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PIN = '123456';

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `key-${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}

describe.skipIf(!TEST_DATABASE_URL)('Credit block, D-26 (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

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

  const customerRepo = () => new DrizzleCustomerRepository();

  function buildSaleUseCase(saleRepository: SaleRepository = new DrizzleSaleRepository(), customerRepository = customerRepo()) {
    return new CreateSaleUseCase(
      saleRepository,
      new DrizzleProductRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      {
        customerRepository,
        customerCreditRepository: new DrizzleCustomerCreditRepository(),
        ownerPinVerifier: new BcryptOwnerPinVerifier(),
      }
    );
  }

  async function seedStore(creditLimit = '100.00', extra: Partial<typeof customers.$inferInsert> = {}) {
    const random = Math.random().toString(36).slice(2);
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${random}` }).returning({ id: merchants.id });
    const merchantId = merchant.id;

    const ownerUsername = `dona_${random}`;
    await database.insert(appUsers).values({
      username: ownerUsername,
      merchantId,
      passwordHash: 'not-used',
      authorizationPinHash: await bcrypt.hash(OWNER_PIN, 4),
      enabled: true,
    });
    await database.insert(userAuthorities).values({ merchantId, username: ownerUsername, authority: 'ROLE_OWNER' });

    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const [product] = await database
      .insert(products)
      .values({ merchantId, barcode: `bc-${random}`, name: 'Pão', salePrice: '10.00' })
      .returning({ id: products.id });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 5 });
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit, ...extra })
      .returning({ id: customers.id });

    return { merchantId, ownerUsername, cashSessionId: session.id, productId: product.id, customerId: customer.id };
  }

  type Seed = Awaited<ReturnType<typeof seedStore>>;

  function tabSale(seed: Seed, amount = '10.00', extra: { ownerPin?: string; ownerUsername?: string } = {}) {
    return {
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: Number(amount) / 10 }],
      payments: [{ method: 'TAB' as const, amount: Money.fromDecimal(amount), externalReference: seed.customerId }],
      idempotencyKey: uniqueKey(),
      ...extra,
    };
  }

  function setBlocked(seed: Seed, creditBlocked: boolean, expectedUpdatedAt?: string) {
    return new UpdateCustomerUseCase(customerRepo()).execute(seed.merchantId, 'dona', seed.customerId, {
      creditBlocked,
      ...(expectedUpdatedAt && { expectedUpdatedAt }),
    });
  }

  async function customerRow(id: string) {
    const [row] = await database.select().from(customers).where(eq(customers.id, id));
    return row;
  }

  async function stockOf(productId: string) {
    const [row] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, productId));
    return row.qty;
  }

  async function ledgerOf(customerId: string) {
    return database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, customerId));
  }

  async function auditOf(aggregateId: string, eventType: string) {
    return database
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.aggregateId, aggregateId), eq(auditEvents.eventType, eventType)));
  }

  async function expectNothingWritten(seed: Seed) {
    expect(await stockOf(seed.productId)).toBe(5);
    expect(await ledgerOf(seed.customerId)).toHaveLength(0);
    expect(await database.select().from(sales).where(eq(sales.merchantId, seed.merchantId))).toHaveLength(0);
    expect(await database.select().from(cashMovements).where(eq(cashMovements.cashSessionId, seed.cashSessionId))).toHaveLength(0);
    expect(
      await database.select().from(auditEvents).where(and(eq(auditEvents.merchantId, seed.merchantId), eq(auditEvents.eventType, 'SALE_CONFIRMED')))
    ).toHaveLength(0);
  }

  describe('the block itself', () => {
    it('persists, audits from/to once, and a repeated value writes no event and keeps updated_at', async () => {
      const seed = await seedStore();
      const before = await customerRow(seed.customerId);
      expect(before.creditBlocked).toBe(false);

      const blocked = await setBlocked(seed, true);

      expect(blocked.creditBlocked).toBe(true);
      const after = await customerRow(seed.customerId);
      expect(after.creditBlocked).toBe(true);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      const events = await auditOf(seed.customerId, 'CUSTOMER_UPDATED');
      expect(events).toHaveLength(1);
      expect(events[0].actorId).toBe('dona');
      expect(events[0].details).toEqual({ changes: { creditBlocked: { from: false, to: true } } });

      await setBlocked(seed, true);
      expect(await auditOf(seed.customerId, 'CUSTOMER_UPDATED')).toHaveLength(1);
      expect((await customerRow(seed.customerId)).updatedAt).toEqual(after.updatedAt);

      await setBlocked(seed, false);
      expect((await customerRow(seed.customerId)).creditBlocked).toBe(false);
      const all = await auditOf(seed.customerId, 'CUSTOMER_UPDATED');
      expect(all).toHaveLength(2);
      expect(all.map((e) => e.details)).toContainEqual({ changes: { creditBlocked: { from: true, to: false } } });
    });

    it('goes together with name and limit in one event and does not change debt, limit or ledger', async () => {
      const seed = await seedStore('100.00');

      await new UpdateCustomerUseCase(customerRepo()).execute(seed.merchantId, 'dona', seed.customerId, {
        name: 'Ana Souza',
        creditLimit: '50',
        creditBlocked: true,
      });

      const row = await customerRow(seed.customerId);
      expect(row).toMatchObject({ name: 'Ana Souza', creditLimit: '50.0000', creditBlocked: true });
      const events = await auditOf(seed.customerId, 'CUSTOMER_UPDATED');
      expect(events).toHaveLength(1);
      expect(Object.keys((events[0].details as { changes: object }).changes).sort()).toEqual(['creditBlocked', 'creditLimit', 'name']);
    });

    it('a stale expectedUpdatedAt is refused and nothing changes', async () => {
      const seed = await seedStore();

      await expect(setBlocked(seed, true, '2020-01-01T00:00:00.000Z')).rejects.toThrow(/alterado por outra pessoa/);

      expect((await customerRow(seed.customerId)).creditBlocked).toBe(false);
      expect(await auditOf(seed.customerId, 'CUSTOMER_UPDATED')).toHaveLength(0);
    });

    it('deactivating and reactivating the customer keeps the block, and the lists return it', async () => {
      const seed = await seedStore('100.00', { creditBlocked: true });
      const repo = customerRepo();
      const customer = (await repo.findById(seed.merchantId, seed.customerId))!;

      await repo.save(customer.deactivate());
      expect((await customerRow(seed.customerId)).creditBlocked).toBe(true);
      await repo.save((await repo.findById(seed.merchantId, seed.customerId))!.activate());

      const row = await customerRow(seed.customerId);
      expect(row).toMatchObject({ active: true, creditBlocked: true });
      const listed = await repo.findAllActive(seed.merchantId);
      expect(listed.map((c) => [c.id, c.toJSON().creditBlocked])).toEqual([[seed.customerId, true]]);
      expect((await repo.search(seed.merchantId, 'Ana'))[0].toJSON().creditBlocked).toBe(true);
    });
  });

  describe('sales with a blocked customer', () => {
    it('refuses a credit sale and writes nothing: no stock, debt, sale, cash or audit', async () => {
      const seed = await seedStore('100.00', { creditBlocked: true });

      await expect(buildSaleUseCase().execute(tabSale(seed))).rejects.toBeInstanceOf(CustomerCreditBlockedError);

      await expectNothingWritten(seed);
    });

    it('the owner PIN does not lift the block, even above the limit, and no PIN attempt is spent', async () => {
      const seed = await seedStore('15.00', { creditBlocked: true });

      await expect(
        buildSaleUseCase().execute(tabSale(seed, '20.00', { ownerPin: OWNER_PIN, ownerUsername: seed.ownerUsername }))
      ).rejects.toBeInstanceOf(CustomerCreditBlockedError);

      await expectNothingWritten(seed);
      expect(await database.select().from(ownerPinAttempts).where(eq(ownerPinAttempts.merchantId, seed.merchantId))).toHaveLength(0);
    });

    it('a cash sale still goes through while the credit is blocked', async () => {
      const seed = await seedStore('100.00', { creditBlocked: true });

      const sale = await buildSaleUseCase().execute({
        merchantId: seed.merchantId,
        operatorId: 'op-1',
        items: [{ productId: seed.productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: Money.fromDecimal('10.00'), receivedAmount: Money.fromDecimal('10.00') }],
        idempotencyKey: uniqueKey(),
      });

      expect(sale.status).toBe('CONFIRMED');
      expect(await stockOf(seed.productId)).toBe(4);
      expect(await ledgerOf(seed.customerId)).toHaveLength(0);
    });

    it('settling a debt still works while the credit is blocked', async () => {
      const seed = await seedStore('100.00');
      await buildSaleUseCase().execute(tabSale(seed, '30.00'));
      await setBlocked(seed, true);

      const result = await new SettleCustomerDebtUseCase(
        customerRepo(),
        new DrizzleCashSessionRepository(),
        new DrizzleDebtSettlementRepository()
      ).execute({
        merchantId: seed.merchantId,
        customerId: seed.customerId,
        amount: Money.fromDecimal('30.00'),
        operatorId: 'op-1',
      });

      expect(result.remainingDebt.toDecimal()).toBe('0.00');
      expect((await ledgerOf(seed.customerId)).map((l) => l.type).sort()).toEqual(['CREDIT', 'DEBIT']);
    });

    it('after unblocking, a credit sale within the limit is accepted again', async () => {
      const seed = await seedStore('100.00', { creditBlocked: true });
      await setBlocked(seed, false);

      expect((await buildSaleUseCase().execute(tabSale(seed))).status).toBe('CONFIRMED');
      expect(await ledgerOf(seed.customerId)).toHaveLength(1);
    });
  });

  describe('race between a credit sale and the block', () => {
    it('(a) the block commits after the sale read the customer but before it locks the row: the sale is refused', async () => {
      const seed = await seedStore('100.00');
      const real = customerRepo();
      // The use case reads the customer unblocked; right after that read, the owner blocks and commits.
      const racing = Object.create(real) as DrizzleCustomerRepository;
      racing.findById = async (merchantId, customerId) => {
        const stale = await real.findById(merchantId, customerId);
        await setBlocked(seed, true);
        return stale;
      };

      await expect(buildSaleUseCase(new DrizzleSaleRepository(), racing).execute(tabSale(seed))).rejects.toBeInstanceOf(
        CustomerCreditBlockedError
      );

      expect((await customerRow(seed.customerId)).creditBlocked).toBe(true);
      await expectNothingWritten(seed);
    });

    it('(b) the sale already holds the customer lock: the block waits, the sale is accepted, the next one is refused', async () => {
      const seed = await seedStore('100.00');
      const inner = new DrizzleSaleRepository();
      let lockedSignal!: () => void;
      const locked = new Promise<void>((resolve) => (lockedSignal = resolve));
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      // ensureAllowed runs after SELECT ... FOR UPDATE of the customer row: hold the transaction open there.
      const holding: SaleRepository = Object.create(inner);
      holding.commitSale = async (commit: SaleCommit) => {
        const original = commit.creditDebit!.ensureAllowed;
        await inner.commitSale({
          ...commit,
          creditDebit: {
            ...commit.creditDebit!,
            ensureAllowed: async (state, debt) => {
              lockedSignal();
              await released;
              return original(state, debt);
            },
          },
        });
      };

      const sale = buildSaleUseCase(holding).execute(tabSale(seed));
      await locked;

      let blockDone = false;
      const block = setBlocked(seed, true).then((result) => {
        blockDone = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(blockDone).toBe(false);

      release();
      expect((await sale).status).toBe('CONFIRMED');
      expect((await block).creditBlocked).toBe(true);

      expect(await ledgerOf(seed.customerId)).toHaveLength(1);
      await expect(buildSaleUseCase().execute(tabSale(seed))).rejects.toBeInstanceOf(CustomerCreditBlockedError);
      expect(await ledgerOf(seed.customerId)).toHaveLength(1);
      expect(await stockOf(seed.productId)).toBe(4);
    });
  });
});
