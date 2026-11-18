import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
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

import bcrypt from 'bcryptjs';
import { merchants, appUsers, userAuthorities } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import { Money } from '@/shared/domain/money';
import { CustomerHasDebtError, CustomerInactiveError, InvalidOwnerPinError, OwnerPinRequiredError } from '../domain/errors';
import { ownerPinAttempts } from '../infrastructure/customers.schema';
import { CreateSaleUseCase } from '@/modules/sales/application/create-sale.use-case';
import type { SaleRepository } from '@/modules/sales/domain/sale-repository.port';
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
import { GetCustomerStatementUseCase } from './get-customer-statement.use-case';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const OWNER_PIN = '123456';
let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `key-${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}

describe.skipIf(!TEST_DATABASE_URL)('Exclude and restore a customer, D-27 (Postgres)', () => {
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

  function tabSale(seed: Seed, amount = '10.00') {
    return {
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: Number(amount) / 10 }],
      payments: [{ method: 'TAB' as const, amount: Money.fromDecimal(amount), externalReference: seed.customerId }],
      idempotencyKey: uniqueKey(),
    };
  }

  function setActive(seed: Seed, active: boolean, expectedUpdatedAt?: string) {
    return new UpdateCustomerUseCase(customerRepo(), new BcryptOwnerPinVerifier()).execute(seed.merchantId, seed.ownerUsername, seed.customerId, {
      active,
      // D-27: excluding needs the owner PIN; restoring does not.
      ...(!active && { ownerPin: OWNER_PIN }),
      ...(expectedUpdatedAt && { expectedUpdatedAt }),
    });
  }

  async function customerRow(id: string) {
    const [row] = await database.select().from(customers).where(eq(customers.id, id));
    return row;
  }

  async function ledgerOf(customerId: string) {
    return database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, customerId));
  }

  async function auditOf(aggregateId: string) {
    return database
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.aggregateId, aggregateId), eq(auditEvents.eventType, 'CUSTOMER_UPDATED')));
  }

  async function debit(seed: Seed, amount: string) {
    await database.insert(customerCreditLedger).values({
      merchantId: seed.merchantId,
      customerId: seed.customerId,
      type: 'DEBIT',
      amount,
      operatorId: 'op-1',
    });
  }

  async function countRows(seed: Seed) {
    const count = async (table: string, column = 'merchant_id') =>
      Number((await database.execute(sql`select count(*)::int as n from ${sql.raw(table)} where ${sql.raw(column)} = ${seed.merchantId}`)).rows[0].n);
    return { customers: await count('customers'), ledger: await count('customer_credit_ledger') };
  }

  describe('the exclusion itself', () => {
    it('excludes with zero debt: audits active from/to once, bumps updated_at, keeps limit and block, deletes nothing', async () => {
      const seed = await seedStore('100.00', { creditBlocked: true });
      const before = await customerRow(seed.customerId);
      const rowsBefore = await countRows(seed);

      const result = await setActive(seed, false);

      expect(result.active).toBe(false);
      const after = await customerRow(seed.customerId);
      expect(after).toMatchObject({ active: false, creditBlocked: true, creditLimit: before.creditLimit, phone: before.phone });
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      const events = await auditOf(seed.customerId);
      expect(events).toHaveLength(1);
      expect(events[0].actorId).toBe(seed.ownerUsername);
      expect(events[0].details).toEqual({ changes: { active: { from: true, to: false } }, authorizedBy: seed.ownerUsername });
      expect(JSON.stringify(events)).not.toContain(OWNER_PIN);
      expect(await countRows(seed)).toEqual(rowsBefore);
    });

    it('without the PIN the exclusion is refused, spends no attempt and writes nothing', async () => {
      const seed = await seedStore();
      const exclude = (ownerPin?: string) =>
        new UpdateCustomerUseCase(customerRepo(), new BcryptOwnerPinVerifier()).execute(seed.merchantId, seed.ownerUsername, seed.customerId, {
          active: false,
          ...(ownerPin && { ownerPin }),
        });

      await expect(exclude()).rejects.toBeInstanceOf(OwnerPinRequiredError);
      expect(await database.select().from(ownerPinAttempts).where(eq(ownerPinAttempts.merchantId, seed.merchantId))).toHaveLength(0);

      await expect(exclude('000000')).rejects.toBeInstanceOf(InvalidOwnerPinError);
      expect((await customerRow(seed.customerId)).active).toBe(true);
      expect(await auditOf(seed.customerId)).toHaveLength(0);
      const [attempts] = await database.select().from(ownerPinAttempts).where(eq(ownerPinAttempts.merchantId, seed.merchantId));
      expect(attempts.failedCount).toBe(1);
    });

    it('the repository refuses an exclusion without authorizedBy, judged under the row lock', async () => {
      const seed = await seedStore();

      await expect(
        customerRepo().updateDetails(seed.merchantId, seed.customerId, { active: false }, { actorId: seed.ownerUsername })
      ).rejects.toBeInstanceOf(OwnerPinRequiredError);

      expect((await customerRow(seed.customerId)).active).toBe(true);
      expect(await auditOf(seed.customerId)).toHaveLength(0);
    });

    it('the right PIN does not release a customer with debt', async () => {
      const seed = await seedStore();
      await debit(seed, '5.00');

      await expect(setActive(seed, false)).rejects.toBeInstanceOf(CustomerHasDebtError);
      expect((await customerRow(seed.customerId)).active).toBe(true);
    });

    it('asking for the value it already has writes no event and keeps updated_at', async () => {
      const seed = await seedStore();
      const before = await customerRow(seed.customerId);

      await setActive(seed, true);

      expect(await auditOf(seed.customerId)).toHaveLength(0);
      expect((await customerRow(seed.customerId)).updatedAt).toEqual(before.updatedAt);
    });

    it('a stale expectedUpdatedAt is refused and nothing changes', async () => {
      const seed = await seedStore();

      await expect(setActive(seed, false, '2020-01-01T00:00:00.000Z')).rejects.toThrow(/alterado por outra pessoa/);

      expect((await customerRow(seed.customerId)).active).toBe(true);
      expect(await auditOf(seed.customerId)).toHaveLength(0);
    });

    it('a customer of another shop is not found and stays untouched', async () => {
      const seed = await seedStore();
      const otherShop = await seedStore();

      await expect(
        new UpdateCustomerUseCase(customerRepo(), new BcryptOwnerPinVerifier()).execute(otherShop.merchantId, otherShop.ownerUsername, seed.customerId, { active: false, ownerPin: OWNER_PIN })
      ).rejects.toThrow(/not found/i);

      expect((await customerRow(seed.customerId)).active).toBe(true);
    });

    it('leaves the default list and the cashier search, appears in the excluded list, and comes back on restore with limit and block', async () => {
      const seed = await seedStore('80.00', { creditBlocked: true });
      const repo = customerRepo();

      await setActive(seed, false);

      expect(await repo.findAllActive(seed.merchantId)).toHaveLength(0);
      expect(await repo.search(seed.merchantId, 'Ana')).toHaveLength(0);
      const excluded = await repo.findAllInactive(seed.merchantId);
      expect(excluded.map((c) => [c.id, c.active])).toEqual([[seed.customerId, false]]);

      await setActive(seed, true);

      expect(await repo.findAllInactive(seed.merchantId)).toHaveLength(0);
      const [back] = await repo.search(seed.merchantId, 'Ana');
      expect(back.toJSON()).toMatchObject({ id: seed.customerId, active: true, creditLimit: '80.00', creditBlocked: true });
      expect((await auditOf(seed.customerId)).map((e) => e.details)).toEqual(
        expect.arrayContaining([{ changes: { active: { from: false, to: true } } }])
      );
    });

    it('keeps the statement readable and the history intact after the exclusion', async () => {
      const seed = await seedStore();
      await buildSaleUseCase().execute(tabSale(seed, '30.00'));
      await new SettleCustomerDebtUseCase(customerRepo(), new DrizzleCashSessionRepository(), new DrizzleDebtSettlementRepository()).execute({
        merchantId: seed.merchantId,
        customerId: seed.customerId,
        amount: Money.fromDecimal('30.00'),
        operatorId: 'op-1',
      });

      await setActive(seed, false);

      const { items } = await new GetCustomerStatementUseCase(customerRepo(), new DrizzleCustomerCreditRepository()).execute({
        merchantId: seed.merchantId,
        customerId: seed.customerId,
      });
      expect(items.map((i) => i.type)).toEqual(['PAYMENT', 'PURCHASE']);
      expect(await ledgerOf(seed.customerId)).toHaveLength(2);
    });
  });

  describe('the debt rule', () => {
    it('refuses with debt of one cent, tells the amount, and nothing changes: no update, no event', async () => {
      const seed = await seedStore();
      await debit(seed, '0.01');
      const before = await customerRow(seed.customerId);

      const attempt = setActive(seed, false);

      await expect(attempt).rejects.toBeInstanceOf(CustomerHasDebtError);
      await expect(attempt).rejects.toThrow('Este cliente deve R$ 0,01. Receba o valor para poder excluir.');
      expect(await customerRow(seed.customerId)).toEqual(before);
      expect(await auditOf(seed.customerId)).toHaveLength(0);
    });

    it('allows it once the debt is fully paid, and refuses again after a new debt', async () => {
      const seed = await seedStore();
      await buildSaleUseCase().execute(tabSale(seed, '30.00'));
      await expect(setActive(seed, false)).rejects.toThrow('Este cliente deve R$ 30,00.');

      await new SettleCustomerDebtUseCase(customerRepo(), new DrizzleCashSessionRepository(), new DrizzleDebtSettlementRepository()).execute({
        merchantId: seed.merchantId,
        customerId: seed.customerId,
        amount: Money.fromDecimal('30.00'),
        operatorId: 'op-1',
      });

      expect((await setActive(seed, false)).active).toBe(false);
    });

    it('restoring is always allowed, even for a legacy inactive customer that has debt', async () => {
      const seed = await seedStore('100.00', { active: false });
      await debit(seed, '25.00');

      expect((await setActive(seed, true)).active).toBe(true);
    });
  });

  describe('sales with an excluded customer', () => {
    it('refuses a credit sale and writes nothing; a sale without a customer still goes through', async () => {
      const seed = await seedStore();
      await setActive(seed, false);

      await expect(buildSaleUseCase().execute(tabSale(seed))).rejects.toBeInstanceOf(CustomerInactiveError);

      expect(await ledgerOf(seed.customerId)).toHaveLength(0);
      expect(await database.select().from(sales).where(eq(sales.merchantId, seed.merchantId))).toHaveLength(0);
      const cash = await buildSaleUseCase().execute({
        merchantId: seed.merchantId,
        operatorId: 'op-1',
        items: [{ productId: seed.productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: Money.fromDecimal('10.00'), receivedAmount: Money.fromDecimal('10.00') }],
        idempotencyKey: uniqueKey(),
      });
      expect(cash.status).toBe('CONFIRMED');
    });
  });

  describe('race between a credit sale and the exclusion', () => {
    it('(a) the sale commits first: the exclusion that comes next is refused for the open debt', async () => {
      const seed = await seedStore();

      await buildSaleUseCase().execute(tabSale(seed));

      await expect(setActive(seed, false)).rejects.toBeInstanceOf(CustomerHasDebtError);
      expect((await customerRow(seed.customerId)).active).toBe(true);
      expect(await ledgerOf(seed.customerId)).toHaveLength(1);
    });

    it('(b) the exclusion commits after the sale read the customer but before it locks the row: the sale is refused, no new debt', async () => {
      const seed = await seedStore();
      const real = customerRepo();
      // The use case reads the customer active; right after that read, the owner excludes and commits.
      const racing = Object.create(real) as DrizzleCustomerRepository;
      racing.findById = async (merchantId, customerId) => {
        const stale = await real.findById(merchantId, customerId);
        await setActive(seed, false);
        return stale;
      };

      await expect(buildSaleUseCase(new DrizzleSaleRepository(), racing).execute(tabSale(seed))).rejects.toBeInstanceOf(
        CustomerInactiveError
      );

      expect((await customerRow(seed.customerId)).active).toBe(false);
      expect(await ledgerOf(seed.customerId)).toHaveLength(0);
      expect(await database.select().from(sales).where(eq(sales.merchantId, seed.merchantId))).toHaveLength(0);
    });

    it('(c) the exclusion holds the customer lock and the sale waits: when it commits, the sale is refused', async () => {
      const seed = await seedStore();
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [seed.customerId]);

        let saleDone = false;
        const sale = buildSaleUseCase()
          .execute(tabSale(seed))
          .finally(() => (saleDone = true));
        const settled = sale.catch((error: unknown) => error);
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(saleDone).toBe(false);

        await holder.query('UPDATE customers SET active = false WHERE id = $1', [seed.customerId]);
        await holder.query('COMMIT');

        expect(await settled).toBeInstanceOf(CustomerInactiveError);
      } finally {
        holder.release();
      }
      expect(await ledgerOf(seed.customerId)).toHaveLength(0);
    });

    it('(d) a debt created while the exclusion waits for the lock is seen: the exclusion is refused', async () => {
      const seed = await seedStore();
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [seed.customerId]);

        let exclusionDone = false;
        const exclusion = setActive(seed, false)
          .catch((error: unknown) => error)
          .finally(() => (exclusionDone = true));
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(exclusionDone).toBe(false);

        await holder.query(
          `INSERT INTO customer_credit_ledger (merchant_id, customer_id, type, amount, operator_id) VALUES ($1, $2, 'DEBIT', '10.00', 'op-1')`,
          [seed.merchantId, seed.customerId]
        );
        await holder.query('COMMIT');

        expect(await exclusion).toBeInstanceOf(CustomerHasDebtError);
      } finally {
        holder.release();
      }
      expect((await customerRow(seed.customerId)).active).toBe(true);
      expect(await auditOf(seed.customerId)).toHaveLength(0);
    });
  });
});
