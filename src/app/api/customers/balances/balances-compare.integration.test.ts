import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';

// The real routes read the global `db`. Point it at the disposable test database.
const holder = vi.hoisted(() => ({ db: null as object | null, merchantId: '' }));
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

// The session only says which merchant is asking; the routes do not read anything else from it.
vi.mock('@/shared/infrastructure/auth/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/infrastructure/auth/auth-context')>();
  return {
    ...actual,
    requireAuthenticatedSession: async () => ({ merchantId: holder.merchantId, username: 'dona', authorities: ['ROLE_OWNER'] }),
  };
});

import { merchants } from '@/modules/users/infrastructure/users.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { GET as listBalances } from './route';
import { GET as individualBalance } from '../[id]/balance/route';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('GET /api/customers/balances agrees with GET /api/customers/[id]/balance (Postgres)', () => {
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

  async function addMerchant() {
    const random = Math.random().toString(36).slice(2);
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${random}` }).returning({ id: merchants.id });
    return merchant.id;
  }

  async function addCustomer(merchantId: string, creditLimit: string, active = true) {
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Cliente', phone: `${Math.random()}`.slice(2, 12), creditLimit, active })
      .returning({ id: customers.id });
    return customer.id;
  }

  async function addMovement(merchantId: string, customerId: string, type: 'DEBIT' | 'CREDIT', amount: string) {
    await database.insert(customerCreditLedger).values({ merchantId, customerId, type, amount, operatorId: 'caixa' });
  }

  async function getList(merchantId: string) {
    holder.merchantId = merchantId;
    const res = await listBalances();
    expect(res.status).toBe(200);
    return (await res.json()) as { items: Array<Record<string, string | boolean>> };
  }

  async function getOne(merchantId: string, customerId: string) {
    holder.merchantId = merchantId;
    const res = await individualBalance(new NextRequest(`http://localhost/api/customers/${customerId}/balance`), {
      params: Promise.resolve({ id: customerId }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, string | boolean>;
  }

  it('every active customer has the same balance in the list and in the individual route, and the list has only the active ones', async () => {
    const merchantId = await addMerchant();
    const otherMerchantId = await addMerchant();

    const ana = await addCustomer(merchantId, '100.00');
    await addMovement(merchantId, ana, 'DEBIT', '80.00');
    await addMovement(merchantId, ana, 'CREDIT', '30.00');

    // Debt above the limit: available is 0.00.
    const bia = await addCustomer(merchantId, '50.00');
    await addMovement(merchantId, bia, 'DEBIT', '120.00');

    // No movements at all.
    const caio = await addCustomer(merchantId, '200.00');

    // Cents that would drift with floats.
    const dani = await addCustomer(merchantId, '10.00');
    await addMovement(merchantId, dani, 'DEBIT', '10.10');
    await addMovement(merchantId, dani, 'DEBIT', '0.20');
    await addMovement(merchantId, dani, 'CREDIT', '0.05');

    // Credit above debit: the raw balance is negative, the debt is locked at 0.00.
    const eva = await addCustomer(merchantId, '30.00');
    await addMovement(merchantId, eva, 'CREDIT', '5.00');
    await addMovement(merchantId, eva, 'DEBIT', '3.00');

    // Excluded customer with debt: not in the list, the individual route still answers.
    const excluded = await addCustomer(merchantId, '100.00', false);
    await addMovement(merchantId, excluded, 'DEBIT', '40.00');

    // Another merchant's movements must not leak.
    const other = await addCustomer(otherMerchantId, '100.00');
    await addMovement(otherMerchantId, other, 'DEBIT', '999.00');

    const list = await getList(merchantId);
    const ids = list.items.map((i) => i.customerId).sort();
    expect(ids).toEqual([ana, bia, caio, dani, eva].sort());

    for (const item of list.items) {
      const one = await getOne(merchantId, item.customerId as string);
      expect(item).toMatchObject({
        customerId: one.customerId,
        name: one.name,
        phone: one.phone,
        active: one.active,
        creditLimit: one.creditLimit,
        currentDebt: one.currentDebt,
        availableCredit: one.availableCredit,
        totalDebits: one.totalDebits,
        totalCredits: one.totalCredits,
      });
    }

    const byId = Object.fromEntries(list.items.map((i) => [i.customerId, i]));
    expect(byId[ana]).toMatchObject({ currentDebt: '50.00', availableCredit: '50.00', totalDebits: '80.00', totalCredits: '30.00' });
    expect(byId[bia]).toMatchObject({ currentDebt: '120.00', availableCredit: '0.00' });
    expect(byId[caio]).toMatchObject({ currentDebt: '0.00', availableCredit: '200.00', totalDebits: '0.00', totalCredits: '0.00' });
    expect(byId[dani]).toMatchObject({ currentDebt: '10.25', totalDebits: '10.30', totalCredits: '0.05' });
    expect(byId[eva]).toMatchObject({ currentDebt: '0.00', availableCredit: '30.00' });
  });

  it('a merchant without customers gets an empty list', async () => {
    const merchantId = await addMerchant();
    expect(await getList(merchantId)).toEqual({ items: [] });
  });
});
