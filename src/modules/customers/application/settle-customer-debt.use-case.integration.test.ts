import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions, cashMovements } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { Money } from '@/shared/domain/money';
import { CreateSaleUseCase } from '@/modules/sales/application/create-sale.use-case';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleCustomerRepository } from '../infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '../infrastructure/drizzle-customer-credit-repository';
import { DrizzleDebtSettlementRepository } from '../infrastructure/drizzle-debt-settlement-repository';
import { BcryptOwnerPinVerifier } from '../infrastructure/bcrypt-owner-pin-verifier';
import { DebtSettlementExceedsBalanceError, NoOpenCashSessionError } from '../domain/errors';
import { SettleCustomerDebtUseCase } from './settle-customer-debt.use-case';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const EXCEEDS = 'Payment amount exceeds current customer debt';

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `key-${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

describe.skipIf(!TEST_DATABASE_URL)('SettleCustomerDebtUseCase with the real Drizzle repositories (Postgres)', () => {
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

  function buildSettleUseCase(customerRepository = new DrizzleCustomerRepository()) {
    return new SettleCustomerDebtUseCase(
      customerRepository,
      new DrizzleCashSessionRepository(),
      new DrizzleDebtSettlementRepository()
    );
  }

  function buildSaleUseCase() {
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

  /** One store with an open cash session, a product, and a customer who owes `debt` (default R$ 100,00). */
  async function seedDebt(options: { debt?: string; creditBlocked?: boolean } = {}) {
    const random = Math.random().toString(36).slice(2);
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${random}` }).returning({ id: merchants.id });
    const merchantId = merchant.id;
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const [product] = await database
      .insert(products)
      .values({ merchantId, barcode: `bc-${random}`, name: 'Pão', salePrice: '10.00' })
      .returning({ id: products.id });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 1000 });
    const [customer] = await database
      .insert(customers)
      .values({
        merchantId,
        name: 'Ana',
        phone: `${Math.random()}`.slice(2, 12),
        creditLimit: '10000.00',
        creditBlocked: options.creditBlocked ?? false,
      })
      .returning({ id: customers.id });
    await database.insert(customerCreditLedger).values({
      merchantId,
      customerId: customer.id,
      type: 'DEBIT',
      amount: options.debt ?? '100.00',
      operatorId: 'op-1',
    });
    return { merchantId, cashSessionId: session.id, productId: product.id, customerId: customer.id };
  }

  type Seed = Awaited<ReturnType<typeof seedDebt>>;

  function settle(seed: Seed, amount: string, useCase = buildSettleUseCase()) {
    return useCase.execute({
      merchantId: seed.merchantId,
      customerId: seed.customerId,
      amount: Money.fromDecimal(amount),
      operatorId: 'op-1',
    });
  }

  function tabSale(seed: Seed) {
    return buildSaleUseCase().execute({
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: 1 }],
      payments: [{ method: 'TAB', amount: Money.fromDecimal('10.00'), externalReference: seed.customerId }],
      idempotencyKey: uniqueKey(),
    });
  }

  async function snapshot(seed: Seed) {
    const ledger = await database
      .select()
      .from(customerCreditLedger)
      .where(eq(customerCreditLedger.customerId, seed.customerId));
    const cash = await database
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.cashSessionId, seed.cashSessionId), eq(cashMovements.movementType, 'DEBT_PAYMENT')));
    const audits = await database
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.aggregateId, seed.customerId), eq(auditEvents.eventType, 'CUSTOMER_DEBT_SETTLED')));
    const sum = (rows: { amount: string }[]) =>
      rows.reduce((total, row) => total.add(Money.fromDecimal(row.amount)), Money.zero());
    const debits = sum(ledger.filter((l) => l.type === 'DEBIT'));
    const credits = sum(ledger.filter((l) => l.type === 'CREDIT'));
    return {
      credits: ledger.filter((l) => l.type === 'CREDIT'),
      creditsTotal: credits,
      debt: debits.subtract(credits),
      cash,
      cashTotal: sum(cash),
      audits,
    };
  }

  /** Makes one kind of insert fail for this store only, runs `body`, and always drops the trigger. */
  async function withFailingInsert(seed: Seed, table: string, condition: string, body: () => Promise<void>) {
    const name = `fail_settle_${Math.random().toString(36).slice(2)}`;
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

  describe('happy path (behavior that must be preserved)', () => {
    it('writes the CREDIT movement, the DEBT_PAYMENT cash entry and the audit', async () => {
      const seed = await seedDebt();

      const result = await settle(seed, '40.00');

      expect(result.remainingDebt.toDecimal()).toBe('60.00');
      expect(result.cashSessionId).toBe(seed.cashSessionId);
      const after = await snapshot(seed);
      expect(after.credits).toHaveLength(1);
      expect(after.credits[0]).toMatchObject({ id: result.movement.id, cashSessionId: seed.cashSessionId, note: 'Quitação de fiado' });
      expect(after.cashTotal.toDecimal()).toBe('40.00');
      expect(after.cash).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
      expect(after.audits[0].details).toMatchObject({
        paymentAmount: '40.00',
        previousDebt: '100.00',
        remainingDebt: '60.00',
        movementId: result.movement.id,
      });
    });

    it('lets a customer with blocked credit (D-26) settle', async () => {
      const seed = await seedDebt({ creditBlocked: true });

      const result = await settle(seed, '100.00');

      expect(result.remainingDebt.toDecimal()).toBe('0.00');
      expect((await snapshot(seed)).debt.toDecimal()).toBe('0.00');
    });

    it('refuses more than the debt with the same error and writes nothing', async () => {
      const seed = await seedDebt();

      await expect(settle(seed, '100.01')).rejects.toBeInstanceOf(DebtSettlementExceedsBalanceError);
      await expect(settle(seed, '100.01')).rejects.toThrow(EXCEEDS);

      const after = await snapshot(seed);
      expect(after.credits).toHaveLength(0);
      expect(after.cash).toHaveLength(0);
      expect(after.audits).toHaveLength(0);
    });
  });

  describe('a write fails in the middle: nothing is written (all or nothing)', () => {
    const targets = [
      { label: 'cash_movements', table: 'cash_movements', condition: `NEW.movement_type = 'DEBT_PAYMENT'` },
      { label: 'customer_credit_ledger', table: 'customer_credit_ledger', condition: `NEW.type = 'CREDIT'` },
      { label: 'audit_events', table: 'audit_events', condition: `NEW.event_type = 'CUSTOMER_DEBT_SETTLED'` },
    ];

    for (const target of targets) {
      it(`leaves debt, drawer and audit untouched when the ${target.label} insert fails`, async () => {
        const seed = await seedDebt();

        await withFailingInsert(seed, target.table, target.condition, async () => {
          await expect(settle(seed, '40.00')).rejects.toThrow();
        });

        const after = await snapshot(seed);
        expect(after.credits).toHaveLength(0);
        expect(after.cash).toHaveLength(0);
        expect(after.audits).toHaveLength(0);
        expect(after.debt.toDecimal()).toBe('100.00');

        // A new attempt without the failure goes through: the failure did not leave a half-done state.
        await settle(seed, '40.00');
        expect((await snapshot(seed)).debt.toDecimal()).toBe('60.00');
      });
    }
  });

  describe('the cash session is closed after the use case read it', () => {
    it('refuses with NoOpenCashSessionError and writes nothing', async () => {
      const seed = await seedDebt();
      const real = new DrizzleCashSessionRepository();
      const racing = Object.create(real) as DrizzleCashSessionRepository;
      racing.findCurrentOpenSession = async (merchantId) => {
        const stale = await real.findCurrentOpenSession(merchantId);
        await database.update(cashSessions).set({ status: 'CLOSED', closedAt: new Date() }).where(eq(cashSessions.id, seed.cashSessionId));
        return stale;
      };
      const useCase = new SettleCustomerDebtUseCase(
        new DrizzleCustomerRepository(),
        racing,
        new DrizzleDebtSettlementRepository()
      );

      await expect(settle(seed, '40.00', useCase)).rejects.toBeInstanceOf(NoOpenCashSessionError);

      const after = await snapshot(seed);
      expect(after.credits).toHaveLength(0);
      expect(after.cash).toHaveLength(0);
      expect(after.audits).toHaveLength(0);
    });
  });

  describe('two simultaneous settlements that together pass the debt', () => {
    it('lets only one pass; the other is refused and the debt never goes negative', async () => {
      const seed = await seedDebt({ debt: '100.00' });

      // Barrier: both calls read the customer (and so the stale picture) before either one writes anything.
      const real = new DrizzleCustomerRepository();
      let arrived = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => (release = resolve));
      const gated = Object.create(real) as DrizzleCustomerRepository;
      gated.findById = async (merchantId, customerId) => {
        const found = await real.findById(merchantId, customerId);
        arrived += 1;
        if (arrived >= 2) release();
        await bothRead;
        return found;
      };

      const results = await withTimeout(
        Promise.allSettled([settle(seed, '70.00', buildSettleUseCase(gated)), settle(seed, '70.00', buildSettleUseCase(gated))]),
        20_000,
        'barrier: fewer than 2 findById calls'
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(DebtSettlementExceedsBalanceError);
      expect(rejected[0].reason.message).toBe(EXCEEDS);

      const after = await snapshot(seed);
      expect(after.creditsTotal.toDecimal()).toBe('70.00');
      expect(after.cashTotal.toDecimal()).toBe('70.00');
      expect(after.cash).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
      expect(after.debt.toDecimal()).toBe('30.00');
    });

    it('with many parallel calls, the sum paid never passes the debt', async () => {
      const seed = await seedDebt({ debt: '100.00' });

      const results = await withTimeout(
        Promise.allSettled(Array.from({ length: 8 }, () => settle(seed, '30.00'))),
        30_000,
        'parallel settlements'
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
        expect(r.reason).toBeInstanceOf(DebtSettlementExceedsBalanceError);
      }
      const after = await snapshot(seed);
      expect(after.debt.toDecimal()).toBe('10.00');
      expect(after.cashTotal.toDecimal()).toBe('90.00');
      expect(after.audits).toHaveLength(3);
    });
  });

  describe('lock order against a concurrent credit sale of the same customer (ADR-021)', () => {
    it('a settlement waits for a lock held by a sale (session shared, then customer) and goes through', async () => {
      const seed = await seedDebt();
      const holderClient = await pool.connect();
      try {
        // What commitSale does first: the session FOR SHARE, then the customer FOR UPDATE.
        await holderClient.query('BEGIN');
        await holderClient.query('SELECT 1 FROM cash_sessions WHERE id = $1 FOR SHARE', [seed.cashSessionId]);
        await holderClient.query('SELECT 1 FROM customers WHERE id = $1 FOR UPDATE', [seed.customerId]);

        let done = false;
        const pending = settle(seed, '40.00').then((value) => {
          done = true;
          return value;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(done).toBe(false); // waits on the customer lock, does not fail and does not deadlock

        await holderClient.query('COMMIT');
        const result = await withTimeout(pending, 10_000, 'settlement after the sale released the locks');
        expect(result.remainingDebt.toDecimal()).toBe('60.00');
      } finally {
        await holderClient.query('ROLLBACK').catch(() => undefined);
        holderClient.release();
      }
    });

    it('settlements and credit sales in parallel never deadlock and keep the books consistent', async () => {
      const seed = await seedDebt({ debt: '100.00' });
      const calls: Promise<unknown>[] = [];
      for (let i = 0; i < 10; i += 1) {
        calls.push(settle(seed, '10.00'), tabSale(seed));
      }

      const results = await withTimeout(Promise.allSettled(calls), 60_000, 'mixed settlements and sales (deadlock?)');

      for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
        expect(r.reason).toBeInstanceOf(DebtSettlementExceedsBalanceError); // never a deadlock (40P01) or other error
      }
      const after = await snapshot(seed);
      const paid = results.filter((_, index) => index % 2 === 0).filter((r) => r.status === 'fulfilled').length;
      expect(after.credits).toHaveLength(paid);
      expect(after.cash).toHaveLength(paid);
      expect(after.audits).toHaveLength(paid);
      expect(after.cashTotal.toDecimal()).toBe(after.creditsTotal.toDecimal());
      expect(after.debt.isNegative()).toBe(false);
    });
  });
});
