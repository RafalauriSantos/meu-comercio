import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { DrizzleOwnerPinAttemptStore } from './drizzle-owner-pin-attempt-store';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Refuse to run against anything that is not a local database named *_test.
// This test migrates and inserts rows, so a production URL must never reach it.
function assertDisposableDatabase(url: string): void {
  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, '');
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!isLocal || !databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point to a local database whose name ends with _test.');
  }
}

describe.skipIf(!TEST_DATABASE_URL)('DrizzleOwnerPinAttemptStore (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const now = new Date('2026-11-06T12:00:00Z');

  beforeAll(async () => {
    assertDisposableDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
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

  it('deixa passar exatamente 5 de 10 tentativas concorrentes numa loja nova', async () => {
    const store = new DrizzleOwnerPinAttemptStore(database);
    const merchantId = await freshMerchant();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.tryReserveAttempt(merchantId, now))
    );

    expect(results.filter((r) => r).length).toBe(5);
    expect((await store.getState(merchantId)).failedCount).toBe(5);
  });

  it('bloqueia durante 15 minutos depois da 5ª tentativa e libera depois', async () => {
    const store = new DrizzleOwnerPinAttemptStore(database);
    const merchantId = await freshMerchant();
    for (let i = 0; i < 5; i++) {
      await store.tryReserveAttempt(merchantId, now);
    }

    expect(await store.tryReserveAttempt(merchantId, now)).toBe(false);
    const later = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    expect(await store.tryReserveAttempt(merchantId, later)).toBe(true);
  });

  it('zera o contador depois de um PIN correto', async () => {
    const store = new DrizzleOwnerPinAttemptStore(database);
    const merchantId = await freshMerchant();
    for (let i = 0; i < 3; i++) {
      await store.tryReserveAttempt(merchantId, now);
    }

    await store.reset(merchantId);

    expect(await store.getState(merchantId)).toEqual({ failedCount: 0, lockedUntil: null });
  });

  it('não afeta outra loja quando uma loja está bloqueada', async () => {
    const store = new DrizzleOwnerPinAttemptStore(database);
    const locked = await freshMerchant();
    const other = await freshMerchant();
    for (let i = 0; i < 5; i++) {
      await store.tryReserveAttempt(locked, now);
    }

    expect(await store.tryReserveAttempt(other, now)).toBe(true);
  });
});
