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
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions, cashMovements } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger, ownerPinAttempts } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales, saleItems, payments } from '@/modules/sales/infrastructure/sales.schema';
import { Money } from '@/shared/domain/money';
import { InvalidOwnerPinError } from '@/modules/customers/domain/errors';
import { CreateSaleUseCase } from './create-sale.use-case';
import { CancelSaleUseCase, SaleAlreadyCancelledError } from './cancel-sale.use-case';
import { DrizzleSaleRepository } from '../infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PIN = '123456';
const REASON = 'Cliente desistiu';
const ALREADY_CANCELLED = 'Venda já se encontra cancelada.';

describe.skipIf(!TEST_DATABASE_URL)('CancelSaleUseCase with the real Drizzle repositories (Postgres)', () => {
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

  function buildCreateUseCase() {
    return new CreateSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleProductRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      {
        customerRepository: new DrizzleCustomerRepository(),
        customerCreditRepository: new DrizzleCustomerCreditRepository(),
        ownerPinVerifier: new BcryptOwnerPinVerifier(),
      }
    );
  }

  // Single place that knows the constructor of the use case under test.
  function buildCancelUseCase() {
    return new CancelSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleCashSessionRepository(),
      new BcryptOwnerPinVerifier()
    );
  }

  /**
   * One store with an open cash session, two products (stock 10 each), a customer and one CONFIRMED sale:
   * 2 x product A + 1 x product B = R$ 30,00, paid R$ 20,00 in cash and R$ 10,00 on tab (fiado).
   */
  async function seedConfirmedSale(options: { stockTracked?: boolean } = {}) {
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
    const productIds: string[] = [];
    for (const name of ['Pão', 'Leite']) {
      const [product] = await database
        .insert(products)
        .values({ merchantId, barcode: `bc-${name}-${random}`, name, salePrice: '10.00' })
        .returning({ id: products.id });
      await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 10 });
      productIds.push(product.id);
    }
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit: '100.00' })
      .returning({ id: customers.id });

    const sale = await buildCreateUseCase().execute({
      merchantId,
      operatorId: 'op-1',
      items: [
        { productId: productIds[0], quantity: 2 },
        { productId: productIds[1], quantity: 1 },
      ],
      payments: [
        { method: 'CASH', amount: Money.fromDecimal('20.00'), receivedAmount: Money.fromDecimal('20.00') },
        { method: 'TAB', amount: Money.fromDecimal('10.00'), externalReference: customer.id },
      ],
      idempotencyKey: `key-${uniqueKey()}`,
    });

    if (options.stockTracked === false) {
      // A sale made with stock control off did not take anything out of stock: put the stock back.
      await database.update(sales).set({ stockTracked: false }).where(eq(sales.id, sale.id));
      await database.update(inventoryItems).set({ availableQuantity: 10 }).where(eq(inventoryItems.merchantId, merchantId));
    }

    return {
      merchantId,
      ownerUsername,
      saleId: sale.id,
      cashSessionId: session.id,
      productIds,
      customerId: customer.id,
      stockAfterSale: options.stockTracked === false ? [10, 10] : [8, 9],
    };
  }

  type Seed = Awaited<ReturnType<typeof seedConfirmedSale>>;

  function cancel(seed: Seed, ownerPin = OWNER_PIN) {
    return buildCancelUseCase().execute({
      merchantId: seed.merchantId,
      saleId: seed.saleId,
      operatorId: 'op-1',
      ownerPin,
      reason: REASON,
    });
  }

  async function snapshot(seed: Seed) {
    const [sale] = await database.select().from(sales).where(eq(sales.id, seed.saleId));
    const stock: number[] = [];
    for (const productId of seed.productIds) {
      const [row] = await database
        .select({ qty: inventoryItems.availableQuantity })
        .from(inventoryItems)
        .where(eq(inventoryItems.productId, productId));
      stock.push(row.qty);
    }
    const returns = await database
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.merchantId, seed.merchantId), eq(inventoryMovements.movementType, 'RETURN')));
    const cashCancels = await database
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.saleId, seed.saleId), eq(cashMovements.movementType, 'CASH_CANCEL')));
    const credits = await database
      .select()
      .from(customerCreditLedger)
      .where(and(eq(customerCreditLedger.saleId, seed.saleId), eq(customerCreditLedger.type, 'CREDIT')));
    const audits = await database
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.aggregateId, seed.saleId), eq(auditEvents.eventType, 'SALE_CANCELLED')));
    const items = await database.select({ id: saleItems.id }).from(saleItems).where(eq(saleItems.saleId, seed.saleId));
    const pays = await database.select({ id: payments.id }).from(payments).where(eq(payments.saleId, seed.saleId));
    return {
      status: sale.status,
      stock,
      returns,
      cashCancels,
      credits,
      audits,
      itemIds: items.map((i) => i.id).sort(),
      paymentIds: pays.map((p) => p.id).sort(),
    };
  }

  function expectNothingWritten(after: Awaited<ReturnType<typeof snapshot>>, before: Awaited<ReturnType<typeof snapshot>>, seed: Seed) {
    expect(after.status).toBe('CONFIRMED');
    expect(after.stock).toEqual(seed.stockAfterSale);
    expect(after.returns).toHaveLength(0);
    expect(after.cashCancels).toHaveLength(0);
    expect(after.credits).toHaveLength(0);
    expect(after.audits).toHaveLength(0);
    expect(after.itemIds).toEqual(before.itemIds);
    expect(after.paymentIds).toEqual(before.paymentIds);
  }

  /** Makes one kind of insert fail for this store only, runs `body`, and always drops the trigger. */
  async function withFailingInsert(
    seed: Seed,
    table: string,
    condition: string,
    body: () => Promise<void>
  ) {
    const name = `fail_cancel_${Math.random().toString(36).slice(2)}`;
    await pool.query(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure (test)'; END $$`
    );
    await pool.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW WHEN (NEW.merchant_id = '${seed.merchantId}' AND ${condition}) EXECUTE FUNCTION ${name}()`
    );
    try {
      await body();
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
      await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
    }
  }

  describe('a write fails in the middle: nothing is written (all or nothing)', () => {
    const targets = [
      { label: 'audit_events', table: 'audit_events', condition: `NEW.event_type = 'SALE_CANCELLED'` },
      { label: 'cash_movements', table: 'cash_movements', condition: `NEW.movement_type = 'CASH_CANCEL'` },
      { label: 'customer_credit_ledger', table: 'customer_credit_ledger', condition: `NEW.type = 'CREDIT'` },
      { label: 'inventory_movements', table: 'inventory_movements', condition: `NEW.movement_type = 'RETURN'` },
    ];

    for (const target of targets) {
      it(`keeps the sale CONFIRMED and everything intact when the ${target.label} insert fails`, async () => {
        const seed = await seedConfirmedSale();
        const before = await snapshot(seed);

        await withFailingInsert(seed, target.table, target.condition, async () => {
          await expect(cancel(seed)).rejects.toThrow();
        });

        expectNothingWritten(await snapshot(seed), before, seed);
      });
    }
  });

  describe('two simultaneous cancellations of the same sale', () => {
    it('refunds once; the other call gets SaleAlreadyCancelledError', async () => {
      const seed = await seedConfirmedSale();

      // Barrier: both calls read the sale as CONFIRMED before either one writes anything.
      const original = DrizzleSaleRepository.prototype.findById;
      let arrived = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => (release = resolve));
      const spy = vi.spyOn(DrizzleSaleRepository.prototype, 'findById').mockImplementation(async function (
        this: DrizzleSaleRepository,
        ...args: Parameters<typeof original>
      ) {
        const found = await original.apply(this, args);
        arrived += 1;
        if (arrived >= 2) release();
        await bothRead;
        return found;
      });

      let results: PromiseSettledResult<unknown>[];
      try {
        results = await Promise.race([
          Promise.allSettled([cancel(seed), cancel(seed)]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('barrier timeout: fewer than 2 findById calls')), 20_000)
          ),
        ]);
      } finally {
        spy.mockRestore();
      }

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(SaleAlreadyCancelledError);
      expect(rejected[0].reason.message).toBe(ALREADY_CANCELLED);

      const after = await snapshot(seed);
      expect(after.status).toBe('CANCELLED');
      expect(after.cashCancels).toHaveLength(1);
      expect(after.credits).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
      expect(after.returns).toHaveLength(2); // one RETURN per item
      expect(after.stock).toEqual([10, 10]); // stock came back once
    });
  });

  describe('happy path (behavior that must be preserved)', () => {
    it('cancels a cash + fiado sale with stock: status, RETURN per item, CASH_CANCEL, CREDIT and audit', async () => {
      const seed = await seedConfirmedSale();
      const before = await snapshot(seed);

      const result = await cancel(seed);

      expect(result.status).toBe('CANCELLED');
      const after = await snapshot(seed);
      expect(after.status).toBe('CANCELLED');
      expect(after.stock).toEqual([10, 10]);

      expect(after.returns).toHaveLength(2);
      const reason = `Cancelamento da venda ${seed.saleId}: ${REASON}`;
      expect(after.returns.map((r) => r.reason)).toEqual([reason, reason]);
      expect(after.returns.map((r) => r.quantity).sort()).toEqual([1, 2]);

      expect(after.cashCancels).toHaveLength(1);
      expect(after.cashCancels[0].cashSessionId).toBe(seed.cashSessionId);
      expect(Money.fromDecimal(after.cashCancels[0].amount).toDecimal()).toBe('20.00');

      expect(after.credits).toHaveLength(1);
      expect(after.credits[0].customerId).toBe(seed.customerId);
      expect(Money.fromDecimal(after.credits[0].amount).toDecimal()).toBe('10.00');
      expect(after.credits[0].note).toBe(`Estorno de venda cancelada ${seed.saleId}: ${REASON}`);

      expect(after.audits).toHaveLength(1);
      expect(after.audits[0].aggregateType).toBe('sale');
      expect(after.audits[0].details).toMatchObject({ reason: REASON, total: '30.00', refundedCash: '20.00' });

      // sale_items and payments are never physically deleted or recreated
      expect(after.itemIds).toEqual(before.itemIds);
      expect(after.paymentIds).toEqual(before.paymentIds);
    });

    it('refuses to cancel the same sale twice, with the same message, and writes nothing more', async () => {
      const seed = await seedConfirmedSale();
      await cancel(seed);
      const once = await snapshot(seed);

      await expect(cancel(seed)).rejects.toThrow(ALREADY_CANCELLED);

      const twice = await snapshot(seed);
      expect(twice.cashCancels).toHaveLength(once.cashCancels.length);
      expect(twice.credits).toHaveLength(once.credits.length);
      expect(twice.audits).toHaveLength(once.audits.length);
      expect(twice.returns).toHaveLength(once.returns.length);
      expect(twice.stock).toEqual(once.stock);
    });

    it('does not move stock nor write RETURN movements for a sale with stock control off (stockTracked = false)', async () => {
      const seed = await seedConfirmedSale({ stockTracked: false });

      await cancel(seed);

      const after = await snapshot(seed);
      expect(after.status).toBe('CANCELLED');
      expect(after.stock).toEqual([10, 10]);
      expect(after.returns).toHaveLength(0);
      // money and fiado are still refunded
      expect(after.cashCancels).toHaveLength(1);
      expect(after.credits).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
    });
  });

  describe('owner PIN', () => {
    async function failedCountOf(merchantId: string) {
      const [row] = await database
        .select({ failedCount: ownerPinAttempts.failedCount })
        .from(ownerPinAttempts)
        .where(eq(ownerPinAttempts.merchantId, merchantId));
      return row?.failedCount ?? 0;
    }

    it('a wrong PIN is refused before any write and the attempt is counted', async () => {
      const seed = await seedConfirmedSale();
      const before = await snapshot(seed);

      await expect(cancel(seed, '000000')).rejects.toBeInstanceOf(InvalidOwnerPinError);

      expectNothingWritten(await snapshot(seed), before, seed);
      expect(await failedCountOf(seed.merchantId)).toBe(1);
    });

    it('the PIN attempt counter is not rolled back when the cancellation fails after a right PIN', async () => {
      const seed = await seedConfirmedSale();
      const before = await snapshot(seed);
      await expect(cancel(seed, '000000')).rejects.toBeInstanceOf(InvalidOwnerPinError);
      expect(await failedCountOf(seed.merchantId)).toBe(1);

      await withFailingInsert(seed, 'audit_events', `NEW.event_type = 'SALE_CANCELLED'`, async () => {
        await expect(cancel(seed)).rejects.toThrow();
      });

      // The right PIN reset the counter before the failing writes, and the failure does not bring it back.
      expect(await failedCountOf(seed.merchantId)).toBe(0);
      expectNothingWritten(await snapshot(seed), before, seed);
    });

    it('keeps blocking after 5 wrong PINs in a row, even with the right PIN', async () => {
      const seed = await seedConfirmedSale();
      const before = await snapshot(seed);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(cancel(seed, '000000')).rejects.toBeInstanceOf(InvalidOwnerPinError);
      }
      await expect(cancel(seed)).rejects.toBeInstanceOf(InvalidOwnerPinError);

      expectNothingWritten(await snapshot(seed), before, seed);
      expect(await failedCountOf(seed.merchantId)).toBe(5);
    });
  });
});

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}
