import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
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

import { appUsers, merchants, userAuthorities } from './users.schema';
import { ownerPinAttempts } from '@/modules/customers/infrastructure/customers.schema';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';
import { DrizzleOwnerPinAttemptStore } from '@/modules/customers/infrastructure/drizzle-owner-pin-attempt-store';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { DrizzlePasswordResetRepository } from './drizzle-password-reset-repository';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { ResetPinUseCase } from '../application/reset-pin.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { hashSecret } from '../domain/password';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt, type RecoveryPurpose } from '../domain/recovery-token';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('PIN reset with the real PIN verifier (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let n = 0;
  const OLD_PASSWORD = 'senha-antiga-1';
  const NEW_PASSWORD = 'senha-nova-123';
  const OLD_PIN = '111111';
  const NEW_PIN = '654321';

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

  async function setup() {
    const now = new Date();
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${Date.now()}-${n++}` }).returning({ id: merchants.id });
    const username = `dona-${Date.now()}-${n++}`;
    const email = `pin-${Date.now()}-${n++}@x.com`;
    await database.insert(appUsers).values({
      username, merchantId: merchant.id, passwordHash: await hashSecret(OLD_PASSWORD), authorizationPinHash: await hashSecret(OLD_PIN),
      email, emailVerifiedAt: now, enabled: true,
    });
    await database.insert(userAuthorities).values({ merchantId: merchant.id, username, authority: 'ROLE_OWNER' });

    const store = new DrizzleOwnerPinAttemptStore(database);
    const resets = new DrizzlePasswordResetRepository(database);
    const tokens = new DrizzleRecoveryTokenRepository(database);
    const limiter = new StubRecoveryLimiter();
    const audit = new RecordingAudit();
    const sender = new InMemoryEmailSender();
    const verifier = new BcryptOwnerPinVerifier(new DrizzleUserRepository(), store);

    async function issue(purpose: RecoveryPurpose) {
      const token = generateRecoveryToken();
      await tokens.issue({
        merchantId: merchant.id, username, purpose, email, tokenHash: hashToken(token), expiresAt: recoveryTokenExpiresAt(now), now,
      });
      return token;
    }
    const resetPin = async (token: string) =>
      new ResetPinUseCase({
        limiter, resets, tokens, audit, sender, pinLock: { clear: (id) => store.reset(id) }, defer: () => {}, reportError: () => {},
      }).execute({ ip: '1.2.3.4', token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, pin: NEW_PIN, confirmPin: NEW_PIN, now: new Date() });
    const resetPassword = async (token: string) =>
      new ResetPasswordUseCase({ limiter, resets, tokens, audit, sender, defer: () => {}, reportError: () => {} })
        .execute({ ip: '1.2.3.4', token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, now: new Date() });
    // Five wrong PINs lock the store for 15 minutes (ADR-013).
    const lockStore = async () => {
      for (let i = 0; i < 5; i++) expect(await verifier.verifyOwnerPin(merchant.id, username, '000000')).toBe(false);
    };

    return { merchantId: merchant.id, username, store, verifier, issue, resetPin, resetPassword, lockStore };
  }

  it('AC-31: o PIN antigo vale antes; depois da troca é recusado (e conta no bloqueio) e o novo é aceito', async () => {
    const t = await setup();
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, OLD_PIN)).toBe(true);

    await t.resetPin(await t.issue('PIN_RESET'));

    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, OLD_PIN)).toBe(false);
    expect((await t.store.getState(t.merchantId)).failedCount).toBe(1);
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, NEW_PIN)).toBe(true);
    expect((await t.store.getState(t.merchantId)).failedCount).toBe(0);
  });

  it('AC-29: a loja bloqueada pelo PIN volta a aceitar o PIN novo logo depois da troca', async () => {
    const t = await setup();
    await t.lockStore();
    expect((await t.store.getState(t.merchantId)).lockedUntil).not.toBeNull();
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, OLD_PIN)).toBe(false);

    await t.resetPin(await t.issue('PIN_RESET'));

    expect(await t.store.getState(t.merchantId)).toEqual({ failedCount: 0, lockedUntil: null });
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, NEW_PIN)).toBe(true);
  });

  it('AC-32: a troca só da senha NÃO zera o bloqueio do PIN, e o PIN antigo continua o mesmo', async () => {
    const t = await setup();
    await t.lockStore();
    const locked = await t.store.getState(t.merchantId);
    const [before] = await database.select().from(appUsers).where(eq(appUsers.username, t.username));

    await t.resetPassword(await t.issue('PASSWORD_RESET'));

    expect(await t.store.getState(t.merchantId)).toEqual(locked);
    expect(locked.failedCount).toBe(5);
    const [after] = await database.select().from(appUsers).where(eq(appUsers.username, t.username));
    expect(after.authorizationPinHash).toBe(before.authorizationPinHash);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    const [row] = await database.select().from(ownerPinAttempts).where(eq(ownerPinAttempts.merchantId, t.merchantId));
    expect(row.lockedUntil).not.toBeNull();
    // Still locked: even the right PIN is refused until the lock ends.
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, OLD_PIN)).toBe(false);
  });

  it('link de senha não troca o PIN, e o link de PIN usado não serve de novo', async () => {
    const t = await setup();
    await expect(t.resetPin(await t.issue('PASSWORD_RESET'))).rejects.toThrow('Link inválido ou vencido');
    expect(await t.verifier.verifyOwnerPin(t.merchantId, t.username, OLD_PIN)).toBe(true);

    const token = await t.issue('PIN_RESET');
    await t.resetPin(token);
    await expect(t.resetPin(token)).rejects.toThrow('Link inválido ou vencido');
  });
});
