import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { count, sql } from 'drizzle-orm';
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
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { CustomerNotFoundError } from '../domain/errors';
import { DrizzleCustomerRepository } from '../infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '../infrastructure/drizzle-customer-credit-repository';
import { GetCustomerBalanceUseCase } from './get-customer-balance.use-case';
import { GetCustomerStatementUseCase, type StatementItem } from './get-customer-statement.use-case';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('Customer statement, D-28 (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let rowSeq = 0;
  // Random prefix so a rerun on the same database does not collide; ids still sort by creation order inside a run.
  const RUN = crypto.randomUUID().slice(0, 8);

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

  const statement = () => new GetCustomerStatementUseCase(new DrizzleCustomerRepository(), new DrizzleCustomerCreditRepository());
  const balance = () => new GetCustomerBalanceUseCase(new DrizzleCustomerRepository(), new DrizzleCustomerCreditRepository());

  async function seedStore() {
    const random = Math.random().toString(36).slice(2);
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${random}` }).returning({ id: merchants.id });
    const merchantId = merchant.id;
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const customerId = await addCustomer(merchantId);
    return { merchantId, cashSessionId: session.id, customerId };
  }

  async function addCustomer(merchantId: string) {
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit: '1000' })
      .returning({ id: customers.id });
    return customer.id;
  }

  type Seed = Awaited<ReturnType<typeof seedStore>>;

  async function addSale(seed: Seed) {
    const [sale] = await database
      .insert(sales)
      .values({ merchantId: seed.merchantId, cashSessionId: seed.cashSessionId, operatorId: 'op-1', subtotal: '10', total: '10' })
      .returning({ id: sales.id });
    return sale.id;
  }

  /** Raw insert so the instant keeps microseconds, like `defaultNow()`, and ties can be forced. */
  async function addMovement(
    seed: Seed,
    m: { type: 'DEBIT' | 'CREDIT'; amount: string; at: string; saleId?: string; note?: string; customerId?: string; id?: string; operator?: string }
  ) {
    rowSeq += 1;
    const id = m.id ?? `${RUN}-0000-4000-8000-${String(rowSeq).padStart(12, '0')}`;
    await database.execute(sql`
      insert into customer_credit_ledger (id, merchant_id, customer_id, type, amount, sale_id, operator_id, authorized_by, note, created_at)
      values (${id}, ${seed.merchantId}, ${m.customerId ?? seed.customerId}, ${m.type}, ${m.amount}, ${m.saleId ?? null},
        ${m.operator ?? 'caixa'}, ${'dona'}, ${m.note ?? null}, ${m.at}::timestamptz)
    `);
    return id;
  }

  async function walk(seed: Seed, limit: number) {
    const all: StatementItem[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard += 1) {
      const page = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit, cursor });
      all.push(...page.items);
      if (!page.nextCursor) return all;
      cursor = page.nextCursor;
    }
    throw new Error('Pagination did not end.');
  }

  const dec = (items: StatementItem[], pick: 'amount' | 'balanceAfter') => items.map((i) => i[pick].toDecimal());

  it('purchase, partial payment and reversal: types, order, running balance, and the newest line equals currentDebt', async () => {
    const seed = await seedStore();
    const saleA = await addSale(seed);
    const saleB = await addSale(seed);
    await addMovement(seed, { type: 'DEBIT', amount: '100.00', at: '2026-11-17T10:00:00Z', saleId: saleA, note: 'Venda fiado' });
    await addMovement(seed, { type: 'CREDIT', amount: '30.00', at: '2026-11-17T11:00:00Z', note: 'Venda fiado' });
    await addMovement(seed, { type: 'DEBIT', amount: '20.00', at: '2026-11-17T12:00:00Z', saleId: saleB });
    await addMovement(seed, { type: 'CREDIT', amount: '20.00', at: '2026-11-17T13:00:00Z', saleId: saleB, note: 'Pagamento de dívida' });

    const { items, nextCursor } = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });

    expect(nextCursor).toBeNull();
    // The note does not decide the type: the payment carries a purchase note and the reversal a payment note.
    expect(items.map((i) => i.type)).toEqual(['REVERSAL', 'PURCHASE', 'PAYMENT', 'PURCHASE']);
    expect(dec(items, 'balanceAfter')).toEqual(['70.00', '90.00', '70.00', '100.00']);
    expect(items[0].operator).toBe('caixa');
    expect(items[0].createdAt.toISOString()).toBe('2026-11-17T13:00:00.000Z');
    expect(items[0].saleId).toBe(saleB);
    expect(items[2].saleId).toBeNull();
    expect(items.map((i) => i.note)).toEqual(['Pagamento de dívida', null, null, null]);

    const current = await balance().execute({ merchantId: seed.merchantId, customerId: seed.customerId });
    expect(items[0].balanceAfter.toDecimal()).toBe(current.currentDebt.toDecimal());

    // The debt goes to 0.00: still equal.
    await addMovement(seed, { type: 'CREDIT', amount: '70.00', at: '2026-11-17T14:00:00Z' });
    const paid = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });
    const paidBalance = await balance().execute({ merchantId: seed.merchantId, customerId: seed.customerId });
    expect(paid.items[0].balanceAfter.toDecimal()).toBe('0.00');
    expect(paid.items[0].balanceAfter.toDecimal()).toBe(paidBalance.currentDebt.toDecimal());
  });

  it('cents add up without floating point error', async () => {
    const seed = await seedStore();
    await addMovement(seed, { type: 'DEBIT', amount: '10.10', at: '2026-11-17T10:00:00Z' });
    await addMovement(seed, { type: 'DEBIT', amount: '0.20', at: '2026-11-17T11:00:00Z' });

    const { items } = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });

    expect(dec(items, 'amount')).toEqual(['0.20', '10.10']);
    expect(dec(items, 'balanceAfter')).toEqual(['10.30', '10.10']);
  });

  it('locks a negative raw balance at 0.00, as /balance does', async () => {
    const seed = await seedStore();
    await addMovement(seed, { type: 'CREDIT', amount: '5.00', at: '2026-11-17T10:00:00Z' });
    await addMovement(seed, { type: 'DEBIT', amount: '8.00', at: '2026-11-17T11:00:00Z' });

    const { items } = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });
    const current = await balance().execute({ merchantId: seed.merchantId, customerId: seed.customerId });

    expect(dec(items, 'balanceAfter')).toEqual(['3.00', '0.00']);
    expect(items[0].balanceAfter.toDecimal()).toBe(current.currentDebt.toDecimal());
  });

  it('no movements: empty page, no cursor', async () => {
    const seed = await seedStore();
    expect(await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId })).toEqual({ items: [], nextCursor: null });
  });

  it('same instant: stable order by id, and paging never repeats or skips a line (also with microsecond ties)', async () => {
    const seed = await seedStore();
    const ids: string[] = [];
    // Three movements at the exact same instant, two that differ only in microseconds, two older ones.
    ids.push(await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: '2026-11-17T09:00:00Z' }));
    ids.push(await addMovement(seed, { type: 'DEBIT', amount: '20.00', at: '2026-11-17T09:30:00Z' }));
    ids.push(await addMovement(seed, { type: 'DEBIT', amount: '1.00', at: '2026-11-17T10:00:00.123456Z' }));
    ids.push(await addMovement(seed, { type: 'CREDIT', amount: '2.00', at: '2026-11-17T10:00:00.123789Z' }));
    for (const amount of ['3.00', '4.00', '5.00']) {
      ids.push(await addMovement(seed, { type: 'DEBIT', amount, at: '2026-11-17T11:00:00Z' }));
    }

    const full = await walk(seed, 50);
    const byThree = await walk(seed, 3);
    const byOne = await walk(seed, 1);

    // Newest first; the tie breaks by id descending.
    expect(full.map((i) => i.id)).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2], ids[1], ids[0]]);
    expect(byThree.map((i) => i.id)).toEqual(full.map((i) => i.id));
    expect(byOne.map((i) => i.id)).toEqual(full.map((i) => i.id));
    // The balance of a line is the same on any page (cumulative: 10, 30, 31, 29, 32, 36, 41).
    expect(dec(full, 'balanceAfter')).toEqual(['41.00', '36.00', '32.00', '29.00', '31.00', '30.00', '10.00']);
    expect(dec(byThree, 'balanceAfter')).toEqual(dec(full, 'balanceAfter'));
  });

  it('page 2 shows the same balances page 1 would; a page that ends at the last item has no cursor', async () => {
    const seed = await seedStore();
    for (let n = 1; n <= 5; n += 1) {
      await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: `2026-11-17T1${n}:00:00Z` });
    }

    const first = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 2 });
    const second = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 2, cursor: first.nextCursor! });
    const third = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 2, cursor: second.nextCursor! });

    expect(dec(first.items, 'balanceAfter')).toEqual(['50.00', '40.00']);
    expect(dec(second.items, 'balanceAfter')).toEqual(['30.00', '20.00']);
    expect(dec(third.items, 'balanceAfter')).toEqual(['10.00']);
    expect(third.nextCursor).toBeNull();

    const exact = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 5 });
    expect(exact.items).toHaveLength(5);
    expect(exact.nextCursor).toBeNull();
  });

  it('a movement written between page 1 and page 2 does not repeat or remove an old line', async () => {
    const seed = await seedStore();
    const old: string[] = [];
    for (let n = 1; n <= 5; n += 1) {
      old.push(await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: `2026-11-17T0${n}:00:00Z` }));
    }

    const first = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 2 });
    const fresh = await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: '2026-11-17T20:00:00Z' });
    const second = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId, limit: 3, cursor: first.nextCursor! });

    expect(first.items.map((i) => i.id)).toEqual([old[4], old[3]]);
    expect(second.items.map((i) => i.id)).toEqual([old[2], old[1], old[0]]);
    expect(second.items.map((i) => i.id)).not.toContain(fresh);
    // The new line is the newest, so the balances of the older lines do not change.
    expect(dec(second.items, 'balanceAfter')).toEqual(['30.00', '20.00', '10.00']);
  });

  it('never shows movements of another customer or another store; another store customer is a 404', async () => {
    const seed = await seedStore();
    const other = await seedStore();
    const sibling = await addCustomer(seed.merchantId);
    await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: '2026-11-17T10:00:00Z' });
    await addMovement(seed, { type: 'DEBIT', amount: '99.00', at: '2026-11-17T10:00:00Z', customerId: sibling });
    await addMovement(other, { type: 'DEBIT', amount: '77.00', at: '2026-11-17T10:00:00Z' });

    const { items } = await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });

    expect(dec(items, 'amount')).toEqual(['10.00']);
    await expect(statement().execute({ merchantId: seed.merchantId, customerId: other.customerId })).rejects.toBeInstanceOf(CustomerNotFoundError);
    await expect(
      statement().execute({ merchantId: seed.merchantId, customerId: '99999999-9999-4999-8999-999999999999' })
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('reads only: ledger and audit rows are the same before and after', async () => {
    const seed = await seedStore();
    await addMovement(seed, { type: 'DEBIT', amount: '10.00', at: '2026-11-17T10:00:00Z' });
    const totals = async () => {
      const [ledger] = await database.select({ n: count() }).from(customerCreditLedger);
      const [audit] = await database.select({ n: count() }).from(auditEvents);
      return [ledger.n, audit.n];
    };

    const before = await totals();
    await statement().execute({ merchantId: seed.merchantId, customerId: seed.customerId });

    expect(await totals()).toEqual(before);
  });
});
