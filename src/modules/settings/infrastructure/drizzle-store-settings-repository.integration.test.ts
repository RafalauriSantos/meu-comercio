import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzleStoreSettingsRepository } from './drizzle-store-settings-repository';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleStoreSettingsRepository (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let repository: DrizzleStoreSettingsRepository<typeof schema>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    repository = new DrizzleStoreSettingsRepository(database);
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function newShop(): Promise<string> {
    const [row] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    return row.id;
  }

  it('a shop that never changed anything controls its stock, as every shop did before', async () => {
    const merchantId = await newShop();

    expect(await repository.get(merchantId)).toEqual({ stockControlEnabled: true });
  });

  it('turns the control off and on again, for that shop only', async () => {
    const shop = await newShop();
    const other = await newShop();

    await repository.setStockControlEnabled(shop, false);

    expect(await repository.get(shop)).toEqual({ stockControlEnabled: false });
    expect(await repository.get(other)).toEqual({ stockControlEnabled: true });

    await repository.setStockControlEnabled(shop, true);
    expect(await repository.get(shop)).toEqual({ stockControlEnabled: true });
  });

  it('answers with the default for a shop that does not exist', async () => {
    expect(await repository.get('00000000-0000-4000-8000-000000000000')).toEqual({ stockControlEnabled: true });
  });

  it('a sale that is saved without saying anything took its items out of the stock, as before', async () => {
    const merchantId = await newShop();
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });

    const [sale] = await database
      .insert(sales)
      .values({ merchantId, cashSessionId: session.id, operatorId: 'op-1', status: 'CONFIRMED', subtotal: '1', total: '1' })
      .returning({ id: sales.id });

    const [row] = await database.select({ tracked: sales.stockTracked }).from(sales).where(eq(sales.id, sale.id));
    expect(row.tracked).toBe(true);
  });
});
