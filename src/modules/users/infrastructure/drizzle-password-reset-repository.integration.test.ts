import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { appUsers, merchants, ownerRecoveryTokens, userAuthorities } from './users.schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzlePasswordResetRepository } from './drizzle-password-reset-repository';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { readCredentialsChangedAt } from './drizzle-credentials-version';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('password reset repository (Postgres)', () => {
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

  const mail = (label: string) => `${label}-${Date.now()}-${n++}@x.com`;

  async function account(opts: { email?: string; verified?: boolean; role?: string; enabled?: boolean; name?: string } = {}) {
    const [merchant] = await database.insert(merchants).values({ name: opts.name ?? `Loja ${n++}` }).returning({ id: merchants.id });
    const username = `dona-${Date.now()}-${n++}`;
    const email = opts.email ?? mail('a');
    await database.insert(appUsers).values({
      username, merchantId: merchant.id, passwordHash: 'old-hash', email, enabled: opts.enabled ?? true,
      emailVerifiedAt: opts.verified === false ? null : now, failedLoginAttempts: 5, lockedUntil: after(600),
    });
    await database.insert(userAuthorities).values({ merchantId: merchant.id, username, authority: opts.role ?? 'ROLE_OWNER' });
    return { username, merchantId: merchant.id, email };
  }

  async function issue(who: { username: string; merchantId: string }, email: string, purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' = 'PASSWORD_RESET', at = now) {
    const token = generateRecoveryToken();
    await tokens.issue({ ...who, purpose, email, tokenHash: hashToken(token), expiresAt: recoveryTokenExpiresAt(at), now: at });
    return hashToken(token);
  }

  const userRow = async (username: string) => (await database.select().from(appUsers).where(eq(appUsers.username, username)))[0];

  it('findOwnerByVerifiedEmail: acha a dona ativa pelo e-mail confirmado e devolve o nome da loja', async () => {
    const who = await account({ name: 'Mercearia da Maria' });

    expect(await resets.findOwnerByVerifiedEmail(who.email)).toEqual({
      merchantId: who.merchantId, username: who.username, merchantName: 'Mercearia da Maria',
    });
  });

  it('AC-14 e AC-56: não acha e-mail não confirmado, de operador, de conta desativada ou inexistente', async () => {
    const unverified = await account({ verified: false });
    const operator = await account({ role: 'ROLE_OPERATOR' });
    const disabled = await account({ enabled: false });

    expect(await resets.findOwnerByVerifiedEmail(unverified.email)).toBeNull();
    expect(await resets.findOwnerByVerifiedEmail(operator.email)).toBeNull();
    expect(await resets.findOwnerByVerifiedEmail(disabled.email)).toBeNull();
    expect(await resets.findOwnerByVerifiedEmail(mail('nobody'))).toBeNull();
  });

  it('ADR-023: vários e-mails iguais NÃO confirmados não atrapalham a conta que confirmou', async () => {
    const shared = mail('shared');
    await account({ email: shared, verified: false });
    const confirmed = await account({ email: shared });

    expect((await resets.findOwnerByVerifiedEmail(shared))?.username).toBe(confirmed.username);
  });

  it('getCredentials devolve hash, e-mail e confirmação', async () => {
    const who = await account();

    expect(await resets.getCredentials(who.username)).toEqual({ passwordHash: 'old-hash', email: who.email, verifiedAt: now });
    expect(await resets.getCredentials('ninguem')).toBeNull();
  });

  it('AC-19 e AC-24: grava o hash, gasta o link, zera o bloqueio de login e marca credentials_changed_at', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    const before = Date.now();
    expect(await resets.resetPassword({ tokenHash: hash, passwordHash: 'new-hash', now: after(5) })).toEqual(who);

    expect(await userRow(who.username)).toMatchObject({
      passwordHash: 'new-hash', failedLoginAttempts: 0, lockedUntil: null,
    });
    // Taken inside the transaction with the real clock, not the request time (a session begun meanwhile also ends).
    expect((await userRow(who.username)).credentialsChangedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(await tokens.find(hash, after(6))).toBeNull();
    expect(await resets.resetPassword({ tokenHash: hash, passwordHash: 'outra', now: after(7) })).toBeNull();
    expect((await userRow(who.username)).passwordHash).toBe('new-hash');
  });

  it('AC-23: 5 envios simultâneos do mesmo link, exatamente 1 grava', async () => {
    const who = await account();
    const hash = await issue(who, who.email);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => resets.resetPassword({ tokenHash: hash, passwordHash: `hash-${i}`, now: after(5) }))
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await userRow(who.username)).passwordHash).toMatch(/^hash-\d$/);
  });

  it('AC-25: link de verificação ou de PIN não redefine senha', async () => {
    const who = await account();
    const hash = await issue(who, who.email, 'EMAIL_VERIFICATION');

    expect(await resets.resetPassword({ tokenHash: hash, passwordHash: 'new-hash', now: after(5) })).toBeNull();
    expect((await userRow(who.username)).passwordHash).toBe('old-hash');
  });

  it('AC-33: vale com 29 min 59 s e não vale com 30 min 00 s', async () => {
    const who = await account();
    const late = await issue(who, who.email);

    expect(await resets.resetPassword({ tokenHash: late, passwordHash: 'x', now: after(30 * 60) })).toBeNull();
    expect(await resets.resetPassword({ tokenHash: late, passwordHash: 'x', now: after(30 * 60 - 1) })).not.toBeNull();
  });

  it('AC-22: e-mail trocado depois do link, ou deixado de confirmar, recusa e não troca a senha', async () => {
    const changed = await account();
    const changedHash = await issue(changed, changed.email);
    await database.update(appUsers).set({ email: mail('novo'), emailVerifiedAt: null }).where(eq(appUsers.username, changed.username));

    expect(await resets.resetPassword({ tokenHash: changedHash, passwordHash: 'x', now: after(5) })).toBeNull();
    expect((await userRow(changed.username)).passwordHash).toBe('old-hash');

    const unverified = await account();
    const unverifiedHash = await issue(unverified, unverified.email);
    await database.update(appUsers).set({ emailVerifiedAt: null }).where(eq(appUsers.username, unverified.username));

    expect(await resets.resetPassword({ tokenHash: unverifiedHash, passwordHash: 'x', now: after(5) })).toBeNull();
    expect((await userRow(unverified.username)).passwordHash).toBe('old-hash');
  });

  it('conta desativada ou sem papel de dona com link ainda válido recebe a recusa neutra e nada muda', async () => {
    const disabled = await account();
    const disabledHash = await issue(disabled, disabled.email);
    await database.update(appUsers).set({ enabled: false }).where(eq(appUsers.username, disabled.username));
    const operator = await account({ role: 'ROLE_OPERATOR' });
    const operatorHash = await issue(operator, operator.email);

    expect(await resets.getCredentials(disabled.username)).toBeNull();
    expect(await resets.getCredentials(operator.username)).toBeNull();
    expect(await resets.resetPassword({ tokenHash: disabledHash, passwordHash: 'x', now: after(5) })).toBeNull();
    expect(await resets.resetPassword({ tokenHash: operatorHash, passwordHash: 'x', now: after(5) })).toBeNull();
    expect((await userRow(disabled.username)).passwordHash).toBe('old-hash');
    expect((await userRow(operator.username)).passwordHash).toBe('old-hash');
  });

  it('readCredentialsChangedAt (sessão): conta com data, sem data e usuário inexistente', async () => {
    const changed = await account();
    const never = await account();
    await database.update(appUsers).set({ credentialsChangedAt: after(9) }).where(eq(appUsers.username, changed.username));

    expect(await readCredentialsChangedAt(database, changed.username)).toEqual(after(9));
    expect(await readCredentialsChangedAt(database, never.username)).toBeNull();
    expect(await readCredentialsChangedAt(database, 'usuario-que-nao-existe')).toBeNull();
  });

  it('AC-34: a coluna guarda só o hash de 64 caracteres', async () => {
    const who = await account();
    await issue(who, who.email);

    const rows = await database.select().from(ownerRecoveryTokens).where(eq(ownerRecoveryTokens.username, who.username));
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
