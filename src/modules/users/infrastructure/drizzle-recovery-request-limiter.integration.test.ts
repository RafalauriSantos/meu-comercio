import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { accessRecoveryRequests } from './users.schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzleRecoveryRequestLimiter } from './drizzle-recovery-request-limiter';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres!!';

describe.skipIf(!TEST_DATABASE_URL)('DrizzleRecoveryRequestLimiter (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let limiter: DrizzleRecoveryRequestLimiter<typeof schema>;
  let n = 0;
  const now = new Date('2026-11-21T12:00:00Z');
  const after = (seconds: number) => new Date(now.getTime() + seconds * 1000);
  const fresh = (label: string) => `${label}-${Date.now()}-${n++}`;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    process.env.SESSION_SECRET = SECRET;
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
    limiter = new DrizzleRecoveryRequestLimiter(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('AC-39: 10 pedidos simultâneos da mesma conta deixam passar exatamente 3', async () => {
    const accountKey = fresh('conta');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey: fresh(`ip${i}`) }, now))
    );

    expect(results.filter((r) => r.status === 'ALLOWED')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'ACCOUNT_LIMITED')).toHaveLength(7);
  });

  it('AC-10: com enforceResend, 10 pedidos simultâneos da mesma conta deixam passar só 1', async () => {
    const accountKey = fresh('conta');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey: fresh(`ip${i}`), enforceResend: true }, now))
    );

    expect(results.filter((r) => r.status === 'ALLOWED')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'TOO_SOON')).toHaveLength(9);
  });

  it('pedido negado não é contado: o bloqueio não se prolonga', async () => {
    const accountKey = fresh('conta');
    const ipKey = fresh('ip');
    // 3 allowed, one minute apart (the 60 s resend rule).
    for (let i = 0; i < 3; i++) expect((await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, after(i * 61))).status).toBe('ALLOWED');

    const denied = await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, after(200));
    expect(denied.status).toBe('ACCOUNT_LIMITED');
    await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, after(300));

    // The wait ends 60 min after the FIRST request, as if the denied ones never happened.
    expect((await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, after(3599))).status).toBe('ACCOUNT_LIMITED');
    expect((await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, after(3600))).status).toBe('ALLOWED');
  });

  it('AC-38: o 11º pedido do mesmo IP em 60 min é recusado, para contas diferentes', async () => {
    const ipKey = fresh('ip');
    for (let i = 0; i < 10; i++) {
      expect((await limiter.reserve({ targetKey: fresh('email'), accountKey: fresh('conta'), ipKey }, after(i))).status).toBe('ALLOWED');
    }

    const decision = await limiter.reserve({ targetKey: fresh('email'), accountKey: fresh('conta'), ipKey }, after(11));
    expect(decision).toMatchObject({ status: 'IP_LIMITED' });
    expect((decision as { retryAfterSeconds: number }).retryAfterSeconds).toBe(3589);
  });

  it('o 4º pedido ao mesmo e-mail de destino é recusado, mesmo por contas e IPs diferentes', async () => {
    const targetKey = fresh('destino');
    for (let i = 0; i < 3; i++) {
      expect((await limiter.reserve({ accountKey: fresh('conta'), ipKey: fresh('ip'), targetKey }, after(i))).status).toBe('ALLOWED');
    }

    const decision = await limiter.reserve({ accountKey: fresh('conta'), ipKey: fresh('ip'), targetKey }, after(10));
    expect(decision).toMatchObject({ status: 'EMAIL_LIMITED', retryAfterSeconds: 3590 });
    expect((await limiter.reserve({ accountKey: fresh('conta'), ipKey: fresh('ip'), targetKey: fresh('outro') }, after(10))).status).toBe('ALLOWED');
  });

  it('pedido negado por e-mail de destino não consome o contador da conta nem o do IP', async () => {
    const targetKey = fresh('destino');
    for (let i = 0; i < 3; i++) await limiter.reserve({ accountKey: fresh('conta'), ipKey: fresh('ip'), targetKey }, after(i));
    const accountKey = fresh('conta');
    const ipKey = fresh('ip');

    for (let i = 0; i < 5; i++) {
      expect((await limiter.reserve({ accountKey, ipKey, targetKey }, after(10 + i))).status).toBe('EMAIL_LIMITED');
    }

    // Nothing was counted for the account or the IP: 3 more requests to other destinations still pass (account limit is 3).
    for (let i = 0; i < 3; i++) {
      expect((await limiter.reserve({ accountKey, ipKey, targetKey: fresh('destino') }, after(100 + i))).status).toBe('ALLOWED');
    }
    expect((await limiter.reserve({ accountKey, ipKey, targetKey: fresh('destino') }, after(200))).status).toBe('ACCOUNT_LIMITED');
  });

  it('o e-mail de destino também é guardado só como HMAC', async () => {
    const targetKey = fresh('maria@loja.com');
    await limiter.reserve({ accountKey: fresh('conta'), ipKey: fresh('ip'), targetKey }, now);

    const rows = await database.select().from(accessRecoveryRequests);
    expect(JSON.stringify(rows)).not.toContain(targetKey);
    expect(rows.some((r) => r.scope === 'TARGET_EMAIL')).toBe(true);
  });

  it('AC-41: 10 tentativas de link por IP em 60 min, a 11ª é recusada, e outro IP não é afetado', async () => {
    const ipKey = fresh('ip');
    const results = await Promise.all(Array.from({ length: 12 }, () => limiter.reserveTokenAttempt(ipKey, now)));

    expect(results.filter((r) => r.status === 'ALLOWED')).toHaveLength(10);
    expect((await limiter.reserveTokenAttempt(fresh('ip'), now)).status).toBe('ALLOWED');
  });

  it('AC-41: o uso normal do link não gasta o limite de pedidos do IP', async () => {
    const ipKey = fresh('ip');
    for (let i = 0; i < 10; i++) await limiter.reserveTokenAttempt(ipKey, now);

    expect((await limiter.reserve({ targetKey: fresh('email'), accountKey: fresh('conta'), ipKey }, now)).status).toBe('ALLOWED');
  });

  it('AC-43: só guarda HMAC das chaves, nunca a conta nem o IP em texto', async () => {
    const accountKey = fresh('dona-maria');
    const ipKey = '203.0.113.77';
    await limiter.reserve({ targetKey: fresh('email'), accountKey, ipKey }, now);
    await limiter.reserveTokenAttempt(ipKey, now);

    const rows = await database.select().from(accessRecoveryRequests);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(accountKey);
    expect(dump).not.toContain(ipKey);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.keyHash))).toBe(true);
    expect(new Set(rows.map((r) => r.scope))).toEqual(new Set(['ACCOUNT', 'IP', 'GLOBAL_DAY', 'IP_TOKEN', 'TARGET_EMAIL']));
  });

  it('AC-43: descarta linhas com mais de 24 h', async () => {
    await database.execute(sql`delete from access_recovery_requests where key_hash = ${'0'.repeat(64)}`);
    await database.insert(accessRecoveryRequests).values({ scope: 'IP', keyHash: '0'.repeat(64), createdAt: new Date(now.getTime() - 25 * 3600 * 1000) });

    await limiter.reserve({ targetKey: fresh('email'), accountKey: fresh('conta'), ipKey: fresh('ip') }, now);

    const old = await database.select().from(accessRecoveryRequests).where(sql`key_hash = ${'0'.repeat(64)}`);
    expect(old).toHaveLength(0);
  });

  it('AC-42: com 250 pedidos no dia, o seguinte é recusado como DAILY_LIMITED', async () => {
    const day = new Date('2026-11-22T12:00:00Z');
    await database.insert(accessRecoveryRequests).values(
      Array.from({ length: 250 }, () => ({ scope: 'GLOBAL_DAY', keyHash: 'g'.repeat(64), createdAt: new Date(day.getTime() - 3600 * 1000) }))
    );

    try {
      expect((await limiter.reserve({ targetKey: fresh('email'), accountKey: fresh('conta'), ipKey: fresh('ip') }, day)).status).toBe('DAILY_LIMITED');
    } finally {
      await database.execute(sql`delete from access_recovery_requests where key_hash = ${'g'.repeat(64)}`);
    }
  });
});
