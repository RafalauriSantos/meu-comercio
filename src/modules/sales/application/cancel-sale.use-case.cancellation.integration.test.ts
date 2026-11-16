import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray } from 'drizzle-orm';
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
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales, saleItems, payments } from '@/modules/sales/infrastructure/sales.schema';
import { Money } from '@/shared/domain/money';
import { NoOpenCashSessionError } from '@/modules/customers/domain/errors';
import { CreateSaleUseCase } from './create-sale.use-case';
import { CancelSaleUseCase, SaleNotFoundError } from './cancel-sale.use-case';
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
const NO_SESSION_MESSAGE = 'Sessão de caixa aberta é obrigatória para efetuar o estorno de dinheiro físico.';

type PaymentMode = 'cash-and-tab' | 'cash' | 'tab';

describe.skipIf(!TEST_DATABASE_URL)('Cancellation: closed session, no deletes, deadlock, tenant isolation, payment mixes (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    // Large pool: the deadlock test runs 40 operations at once and they must really overlap.
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 50 });
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

  function buildCancelUseCase() {
    return new CancelSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleCashSessionRepository(),
      new BcryptOwnerPinVerifier()
    );
  }

  /** One store: open cash session, products Pão and Leite (stock 10 each), a customer (limit 100). */
  async function seedStore() {
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
    return { merchantId, cashSessionId: session.id, productIds, customerId: customer.id };
  }

  type Store = Awaited<ReturnType<typeof seedStore>>;

  /** 2 x Pão + 1 x Leite = R$ 30,00, paid according to `mode`. */
  async function sellThreeUnits(store: Store, mode: PaymentMode) {
    const cash = (amount: string) => ({
      method: 'CASH' as const,
      amount: Money.fromDecimal(amount),
      receivedAmount: Money.fromDecimal(amount),
    });
    const tab = (amount: string) => ({
      method: 'TAB' as const,
      amount: Money.fromDecimal(amount),
      externalReference: store.customerId,
    });
    const paymentList =
      mode === 'cash-and-tab' ? [cash('20.00'), tab('10.00')] : mode === 'cash' ? [cash('30.00')] : [tab('30.00')];
    return buildCreateUseCase().execute({
      merchantId: store.merchantId,
      operatorId: 'op-1',
      items: [
        { productId: store.productIds[0], quantity: 2 },
        { productId: store.productIds[1], quantity: 1 },
      ],
      payments: paymentList,
      idempotencyKey: `key-${uniqueKey()}`,
    });
  }

  function cancel(merchantId: string, saleId: string) {
    return buildCancelUseCase().execute({ merchantId, saleId, operatorId: 'op-1', ownerPin: OWNER_PIN, reason: REASON });
  }

  async function closeSession(store: Store) {
    await database
      .update(cashSessions)
      .set({ status: 'CLOSED', closedBy: 'op-1', closedAt: new Date(), closingBalance: '0' })
      .where(eq(cashSessions.id, store.cashSessionId));
  }

  async function stockOf(store: Store) {
    const rows = await database.select().from(inventoryItems).where(inArray(inventoryItems.productId, store.productIds));
    return store.productIds.map((id) => rows.find((r) => r.productId === id)!.availableQuantity);
  }

  async function effectsOf(store: Store, saleId: string) {
    const [sale] = await database.select({ status: sales.status }).from(sales).where(eq(sales.id, saleId));
    return {
      status: sale.status,
      stock: await stockOf(store),
      returns: await database
        .select()
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.merchantId, store.merchantId), eq(inventoryMovements.movementType, 'RETURN'))),
      cashCancels: await database
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.saleId, saleId), eq(cashMovements.movementType, 'CASH_CANCEL'))),
      credits: await database
        .select()
        .from(customerCreditLedger)
        .where(and(eq(customerCreditLedger.saleId, saleId), eq(customerCreditLedger.type, 'CREDIT'))),
      audits: await database
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.aggregateId, saleId), eq(auditEvents.eventType, 'SALE_CANCELLED'))),
    };
  }

  async function ledgerDebt(store: Store): Promise<string> {
    const rows = await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, store.customerId));
    const cents = rows.reduce(
      (sum, r) => sum + (r.type === 'DEBIT' ? 1 : -1) * Math.round(Number(r.amount) * 100),
      0
    );
    return (cents / 100).toFixed(2);
  }

  async function cashNet(store: Store): Promise<string> {
    const rows = await database.select().from(cashMovements).where(eq(cashMovements.cashSessionId, store.cashSessionId));
    let cents = 0;
    for (const r of rows) {
      const value = Math.round(Number(r.amount) * 100);
      if (r.movementType === 'SALE_RECEIPT') cents += value;
      else if (r.movementType === 'CASH_CANCEL') cents -= value;
      else throw new Error(`unexpected movement type ${r.movementType}`);
    }
    return (cents / 100).toFixed(2);
  }

  describe('cash session closed between the read and the transaction (criterion 6)', () => {
    it('throws NoOpenCashSessionError with the usual message, without the session id, and writes nothing', async () => {
      const store = await seedStore();
      const sale = await sellThreeUnits(store, 'cash-and-tab');
      const before = await effectsOf(store, sale.id);
      expect(before.stock).toEqual([8, 9]);
      const debtBefore = await ledgerDebt(store);

      // The use case has just read the session as open; close it right after that read.
      const original = DrizzleCashSessionRepository.prototype.findCurrentOpenSession;
      const spy = vi
        .spyOn(DrizzleCashSessionRepository.prototype, 'findCurrentOpenSession')
        .mockImplementation(async function (this: DrizzleCashSessionRepository, ...args: Parameters<typeof original>) {
          const found = await original.apply(this, args);
          expect(found?.id).toBe(store.cashSessionId);
          await closeSession(store);
          return found;
        });

      let error: unknown;
      try {
        await cancel(store.merchantId, sale.id).catch((e) => {
          error = e;
        });
      } finally {
        spy.mockRestore();
      }

      expect(error).toBeInstanceOf(NoOpenCashSessionError);
      expect((error as Error).message).toBe(NO_SESSION_MESSAGE);
      expect((error as Error).message).not.toContain(store.cashSessionId);

      const after = await effectsOf(store, sale.id);
      expect(after.status).toBe('CONFIRMED');
      expect(after.stock).toEqual([8, 9]);
      expect(after.returns).toHaveLength(0);
      expect(after.cashCancels).toHaveLength(0);
      expect(after.credits).toHaveLength(0);
      expect(after.audits).toHaveLength(0);
      expect(await ledgerDebt(store)).toBe(debtBefore);
    });
  });

  describe('no physical DELETE on the cancellation path (criterion 10)', () => {
    it('keeps the exact same sale_items and payments rows (ids and contents) and no DELETE statement fires', async () => {
      const store = await seedStore();
      const sale = await sellThreeUnits(store, 'cash-and-tab');

      const itemsBefore = await database.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      const paymentsBefore = await database.select().from(payments).where(eq(payments.saleId, sale.id));
      expect(itemsBefore).toHaveLength(2);
      expect(paymentsBefore).toHaveLength(2);

      // Any DELETE on a financial table of this store aborts the transaction, so a delete + re-insert
      // that happens to reuse the same ids would still be caught.
      const guarded = ['sale_items', 'payments', 'cash_movements', 'customer_credit_ledger', 'inventory_movements', 'audit_events'];
      const names: Array<{ fn: string; table: string }> = [];
      for (const table of guarded) {
        const fn = `no_delete_${table}_${Math.random().toString(36).slice(2)}`;
        await pool.query(
          `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'physical DELETE on ${table} is forbidden (test)'; END $$`
        );
        await pool.query(
          `CREATE TRIGGER ${fn} BEFORE DELETE ON ${table} FOR EACH ROW WHEN (OLD.merchant_id = '${store.merchantId}') EXECUTE FUNCTION ${fn}()`
        );
        names.push({ fn, table });
      }
      try {
        const result = await cancel(store.merchantId, sale.id);
        expect(result.status).toBe('CANCELLED');
      } finally {
        for (const { fn, table } of names) {
          await pool.query(`DROP TRIGGER IF EXISTS ${fn} ON ${table}`);
          await pool.query(`DROP FUNCTION IF EXISTS ${fn}()`);
        }
      }

      const itemsAfter = await database.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      const paymentsAfter = await database.select().from(payments).where(eq(payments.saleId, sale.id));
      const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(byId(itemsAfter)).toEqual(byId(itemsBefore));
      expect(byId(paymentsAfter)).toEqual(byId(paymentsBefore));
      expect((await effectsOf(store, sale.id)).status).toBe('CANCELLED');
    });
  });

  describe('cancel and sell at the same time on shared products (deadlock)', () => {
    it('20 parallel pairs finish without 40P01 and the final balances match the expected arithmetic', { timeout: 60_000 }, async () => {
      const pairs = 20;
      const stores: Store[] = [];
      const saleIds: string[] = [];
      for (let i = 0; i < pairs; i += 1) {
        const store = await seedStore();
        stores.push(store);
        saleIds.push((await sellThreeUnits(store, 'cash-and-tab')).id);
      }

      // Widen the race window: every stock movement of these stores holds its locks 40 ms longer, so
      // two transactions that lock the same products in opposite orders would deadlock every time.
      const slowFn = `slow_movement_${Math.random().toString(36).slice(2)}`;
      const merchantList = stores.map((s) => `'${s.merchantId}'`).join(',');
      await pool.query(
        `CREATE FUNCTION ${slowFn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.04); RETURN NEW; END $$`
      );
      await pool.query(
        `CREATE TRIGGER ${slowFn} BEFORE INSERT ON inventory_movements FOR EACH ROW WHEN (NEW.merchant_id IN (${merchantList})) EXECUTE FUNCTION ${slowFn}()`
      );

      let results: PromiseSettledResult<unknown>[];
      try {
        results = await Promise.allSettled(
        stores.flatMap((store, i) => [
          cancel(store.merchantId, saleIds[i]),
          // New sale lists the products in the opposite order: 3 x Leite + 2 x Pão = R$ 50,00 in cash.
          buildCreateUseCase().execute({
            merchantId: store.merchantId,
            operatorId: 'op-1',
            items: [
              { productId: store.productIds[1], quantity: 3 },
              { productId: store.productIds[0], quantity: 2 },
            ],
            payments: [
              { method: 'CASH', amount: Money.fromDecimal('50.00'), receivedAmount: Money.fromDecimal('50.00') },
            ],
            idempotencyKey: `key-${uniqueKey()}`,
          }),
        ])
        );
      } finally {
        await pool.query(`DROP TRIGGER IF EXISTS ${slowFn} ON inventory_movements`);
        await pool.query(`DROP FUNCTION IF EXISTS ${slowFn}()`);
      }

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(failures.map((f) => (f.reason as { code?: string; message?: string }).code ?? f.reason?.message)).toEqual([]);
      expect(results).toHaveLength(pairs * 2);

      for (let i = 0; i < pairs; i += 1) {
        const store = stores[i];
        const after = await effectsOf(store, saleIds[i]);
        expect(after.status).toBe('CANCELLED');
        // 10 - (2,1) + (2,1) - (2 Pão, 3 Leite) = [8, 7]
        expect(after.stock).toEqual([8, 7]);
        expect(after.cashCancels).toHaveLength(1);
        expect(after.credits).toHaveLength(1);
        expect(after.audits).toHaveLength(1);
        // cash: +20 (first sale) -20 (cancel) +50 (second sale)
        expect(await cashNet(store)).toBe('50.00');
        // fiado: +10 debit, -10 credit
        expect(await ledgerDebt(store)).toBe('0.00');
      }
    });
  });

  describe('tenant isolation', () => {
    it('store B cannot cancel the sale of store A: same not-found error as today and nothing is written', async () => {
      const storeA = await seedStore();
      const storeB = await seedStore();
      const sale = await sellThreeUnits(storeA, 'cash-and-tab');
      const before = await effectsOf(storeA, sale.id);
      const debtBefore = await ledgerDebt(storeA);
      const cashBefore = await cashNet(storeA);

      const error = await cancel(storeB.merchantId, sale.id).catch((e) => e);

      expect(error).toBeInstanceOf(SaleNotFoundError);
      expect(error.message).toBe(`Venda [${sale.id}] não encontrada.`);

      const after = await effectsOf(storeA, sale.id);
      expect(after.status).toBe('CONFIRMED');
      expect(after.stock).toEqual(before.stock);
      expect(after.returns).toHaveLength(0);
      expect(after.cashCancels).toHaveLength(0);
      expect(after.credits).toHaveLength(0);
      expect(after.audits).toHaveLength(0);
      expect(await ledgerDebt(storeA)).toBe(debtBefore);
      expect(await cashNet(storeA)).toBe(cashBefore);
      expect(await stockOf(storeB)).toEqual([10, 10]);
    });
  });

  describe('sales paid only in cash or only on tab', () => {
    it('cash only: refunds the cash, writes no fiado credit, returns the stock', async () => {
      const store = await seedStore();
      const sale = await sellThreeUnits(store, 'cash');

      await cancel(store.merchantId, sale.id);

      const after = await effectsOf(store, sale.id);
      expect(after.status).toBe('CANCELLED');
      expect(after.stock).toEqual([10, 10]);
      expect(after.returns).toHaveLength(2);
      expect(after.cashCancels).toHaveLength(1);
      expect(Money.fromDecimal(after.cashCancels[0].amount).toDecimal()).toBe('30.00');
      expect(after.credits).toHaveLength(0);
      expect(after.audits).toHaveLength(1);
      expect(after.audits[0].details).toMatchObject({ reason: REASON, total: '30.00', refundedCash: '30.00' });
      expect(await cashNet(store)).toBe('0.00');
    });

    it('tab only: restores the fiado, writes no cash movement, and needs no open cash session', async () => {
      const store = await seedStore();
      const sale = await sellThreeUnits(store, 'tab');
      expect(await ledgerDebt(store)).toBe('30.00');
      await closeSession(store);

      await cancel(store.merchantId, sale.id);

      const after = await effectsOf(store, sale.id);
      expect(after.status).toBe('CANCELLED');
      expect(after.stock).toEqual([10, 10]);
      expect(after.returns).toHaveLength(2);
      expect(after.cashCancels).toHaveLength(0);
      expect(after.credits).toHaveLength(1);
      expect(Money.fromDecimal(after.credits[0].amount).toDecimal()).toBe('30.00');
      expect(after.audits).toHaveLength(1);
      expect(after.audits[0].details).toMatchObject({ reason: REASON, total: '30.00', refundedCash: '0.00' });
      expect(await ledgerDebt(store)).toBe('0.00');
    });
  });
});

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}
