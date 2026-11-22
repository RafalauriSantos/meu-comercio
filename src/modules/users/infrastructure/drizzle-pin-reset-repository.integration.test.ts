import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { appUsers, merchants, userAuthorities } from './users.schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzlePasswordResetRepository } from './drizzle-password-reset-repository';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt, type RecoveryPurpose } from '../domain/recovery-token';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('PIN reset in the repository (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let resets: DrizzlePasswordResetRepository<typeof schema>;
  let tokens: DrizzleRecoveryTokenRepository<typeof schema>;
  let n = 0;
  const now = new Date('2026-11-21T12:00:00Z');
  const after = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
    resets = new DrizzlePasswordResetRepository(database);
    tokens = new DrizzleRecoveryTokenRepository(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function account(opts: { role?: string; enabled?: boolean; verified?: boolean } = {}) {
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${Date.now()}-${n++}` }).returning({ id: merchants.id });
    const username = `dona-${Date.now()}-${n++}`;
    const email = `pin-${Date.now()}-${n++}@x.com`;
    await database.insert(appUsers).values({
      username, merchantId: merchant.id, passwordHash: 'old-hash', authorizationPinHash: 'old-pin-hash', email,
      enabled: opts.enabled ?? true, emailVerifiedAt: opts.verified === false ? null : now,
      failedLoginAttempts: 5, lockedUntil: after(600),
    });
    await database.insert(userAuthorities).values({ merchantId: merchant.id, username, authority: opts.role ?? 'ROLE_OWNER' });
    return { username, merchantId: merchant.id, email };
  }

  async function issue(who: { username: string; merchantId: string }, email: string, purpose: RecoveryPurpose = 'PIN_RESET') {
    const token = generateRecoveryToken();
    await tokens.issue({ ...who, purpose, email, tokenHash: hashToken(token), expiresAt: recoveryTokenExpiresAt(now), now });
    return hashToken(token);
  }

  const userRow = async (username: string) => (await database.select().from(appUsers).where(eq(appUsers.username, username)))[0];
  const params = (tokenHash: string, at = after(5)) => ({ tokenHash, passwordHash: 'new-hash', pinHash: 'new-pin-hash', now: at });

  it('AC-29: grava senha e PIN juntos, gasta o link, zera o bloqueio de login e marca credentials_changed_at', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    const before = Date.now();
    expect(await resets.resetPasswordAndPin(params(hash))).toEqual(who);

    const row = await userRow(who.username);
    expect(row).toMatchObject({ passwordHash: 'new-hash', authorizationPinHash: 'new-pin-hash', failedLoginAttempts: 0, lockedUntil: null });
    expect(row.credentialsChangedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(await tokens.find(hash, after(6))).toBeNull();
    expect(await resets.resetPasswordAndPin(params(hash, after(7)))).toBeNull();
  });

  it('AC-29 atomicidade: se a gravação falha no meio, nem a senha, nem o PIN, nem o link mudam', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    // authorization_pin_hash is varchar(255): the UPDATE of app_users fails after the link was already marked used.
    await expect(resets.resetPasswordAndPin({ ...params(hash), pinHash: 'x'.repeat(300) })).rejects.toThrow();

    expect(await userRow(who.username)).toMatchObject({
      passwordHash: 'old-hash', authorizationPinHash: 'old-pin-hash', failedLoginAttempts: 5, credentialsChangedAt: null,
    });
    expect(await tokens.find(hash, after(6))).not.toBeNull();
    expect(await resets.resetPasswordAndPin(params(hash))).toEqual(who);
  });

  it('AC-23: 5 envios simultâneos do mesmo link, exatamente 1 grava', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => resets.resetPasswordAndPin({ ...params(hash), passwordHash: `hash-${i}`, pinHash: `pin-${i}` }))
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const row = await userRow(who.username);
    expect(row.passwordHash).toMatch(/^hash-\d$/);
    expect(row.authorizationPinHash).toBe(row.passwordHash!.replace('hash', 'pin'));
  });

  it('AC-25: só o link PIN_RESET serve, e o link de PIN não troca só a senha', async () => {
    const who = await account();
    const passwordLink = await issue(who, who.email, 'PASSWORD_RESET');
    const verificationLink = await issue(who, who.email, 'EMAIL_VERIFICATION');
    const pinLink = await issue(who, who.email, 'PIN_RESET');

    expect(await resets.resetPasswordAndPin(params(passwordLink))).toBeNull();
    expect(await resets.resetPasswordAndPin(params(verificationLink))).toBeNull();
    expect(await resets.resetPassword({ tokenHash: pinLink, passwordHash: 'x', now: after(5) })).toBeNull();
    expect(await userRow(who.username)).toMatchObject({ passwordHash: 'old-hash', authorizationPinHash: 'old-pin-hash' });
    expect(await tokens.find(pinLink, after(6))).not.toBeNull();
  });

  it('AC-33: vale com 29 min 59 s e não vale com 30 min 00 s', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    expect(await resets.resetPasswordAndPin(params(hash, after(30 * 60)))).toBeNull();
    expect(await resets.resetPasswordAndPin(params(hash, after(30 * 60 - 1)))).not.toBeNull();
  });

  it('e-mail trocado ou deixado de confirmar, conta desativada e operadora: recusa e não grava', async () => {
    const changed = await account();
    const changedHash = await issue(changed, changed.email);
    await database.update(appUsers).set({ email: `novo-${n++}@x.com`, emailVerifiedAt: null }).where(eq(appUsers.username, changed.username));
    const disabled = await account();
    const disabledHash = await issue(disabled, disabled.email);
    await database.update(appUsers).set({ enabled: false }).where(eq(appUsers.username, disabled.username));
    const operator = await account({ role: 'ROLE_OPERATOR' });
    const operatorHash = await issue(operator, operator.email);

    for (const [who, hash] of [[changed, changedHash], [disabled, disabledHash], [operator, operatorHash]] as const) {
      expect(await resets.resetPasswordAndPin(params(hash))).toBeNull();
      expect(await userRow(who.username)).toMatchObject({ passwordHash: 'old-hash', authorizationPinHash: 'old-pin-hash' });
    }
  });

  it('a troca só da senha não mexe no PIN', async () => {
    const who = await account();
    const hash = await issue(who, who.email, 'PASSWORD_RESET');

    expect(await resets.resetPassword({ tokenHash: hash, passwordHash: 'new-hash', now: after(5) })).toEqual(who);

    expect(await userRow(who.username)).toMatchObject({ passwordHash: 'new-hash', authorizationPinHash: 'old-pin-hash' });
  });
});
