import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { DrizzleOwnerEmailRepository } from './drizzle-owner-email-repository';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { DrizzleRecoveryRequestLimiter } from './drizzle-recovery-request-limiter';
import { RegisterMerchantUseCase } from '../application/register-merchant.use-case';
import { RequestEmailVerificationUseCase } from '../application/request-email-verification.use-case';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { RecordingAudit } from '../testing/recovery-fakes';

// DrizzleUserRepository uses the app's global `db` (Neon). Here it points to the disposable Postgres.
const holder = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('@/shared/infrastructure/db/connection', () => ({
  db: new Proxy({}, { get: (_target, prop) => (holder.database as Record<string | symbol, unknown>)[prop] }),
}));

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('cadastro e envio do link usam o mesmo e-mail (Postgres)', () => {
  let pool: Pool;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    process.env.SESSION_SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres!!';
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const database = drizzle(pool, { schema });
    holder.database = database;
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('AC-8: e-mail digitado em maiúsculas e com espaços é enviado, sem senha, ao e-mail normalizado', async () => {
    const database = holder.database as ReturnType<typeof drizzle<typeof schema>>;
    const users = new DrizzleUserRepository();
    const sender = new InMemoryEmailSender();
    const request = new RequestEmailVerificationUseCase({
      limiter: new DrizzleRecoveryRequestLimiter(database),
      owners: new DrizzleOwnerEmailRepository(database),
      tokens: new DrizzleRecoveryTokenRepository(database),
      sender,
      audit: new RecordingAudit(),
      users,
      baseUrl: 'https://app.exemplo.com.br',
    });
    const username = `loja-${Date.now()}`;
    const typed = `  Maria.${Date.now()}@Loja.COM  `;
    const normalized = typed.trim().toLowerCase();

    const owner = await new RegisterMerchantUseCase(users).execute({
      merchantName: 'Mercadinho', username, password: 'password-12345', authorizationPin: '123456', email: typed,
    });
    const result = await request.execute({
      merchantId: owner.merchantId, username: owner.username, ip: '203.0.113.9', now: new Date('2026-11-21T12:00:00Z'),
    });

    expect(result).toEqual({ email: normalized });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(normalized);
  });
});
