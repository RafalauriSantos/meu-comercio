import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { appUsers, merchants, ownerRecoveryTokens } from './users.schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { DrizzleOwnerEmailRepository } from './drizzle-owner-email-repository';
import { DrizzleRecoveryRequestLimiter } from './drizzle-recovery-request-limiter';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { EmailInUseError, InvalidOrExpiredLinkError } from '../domain/errors';
import { hashSecret } from '../domain/password';
import type { UserRepository } from '../domain/user-repository.port';
import { RequestEmailVerificationUseCase } from '../application/request-email-verification.use-case';
import { ConfirmEmailVerificationUseCase } from '../application/confirm-email-verification.use-case';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { RecordingAudit } from '../testing/recovery-fakes';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('recovery token and owner e-mail repositories (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tokens: DrizzleRecoveryTokenRepository<typeof schema>;
  let owners: DrizzleOwnerEmailRepository<typeof schema>;
  let n = 0;
  const now = new Date('2026-11-21T12:00:00Z');
  const after = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    process.env.SESSION_SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres!!';
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
    tokens = new DrizzleRecoveryTokenRepository(database);
    owners = new DrizzleOwnerEmailRepository(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  const mail = (label: string) => `${label}-${Date.now()}-${n++}@x.com`;

  async function owner(email: string | null = null, verified = false) {
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${n++}` }).returning({ id: merchants.id });
    const username = `dona-${Date.now()}-${n++}`;
    await database.insert(appUsers).values({
      username, merchantId: merchant.id, passwordHash: 'x', email, emailVerifiedAt: verified ? now : null,
    });
    return { username, merchantId: merchant.id, email: email as string };
  }

  async function issue(who: { username: string; merchantId: string }, email: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' = 'EMAIL_VERIFICATION', at = now) {
    const token = generateRecoveryToken();
    await tokens.issue({ ...who, purpose, email, tokenHash: hashToken(token), expiresAt: recoveryTokenExpiresAt(at), now: at });
    return token;
  }

  it('AC-34: guarda só o hash de 64 caracteres, nunca o token', async () => {
    const who = await owner(mail('a'));
    const token = await issue(who, who.email);

    const rows = await database.select().from(ownerRecoveryTokens).where(eq(ownerRecoveryTokens.username, who.username));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0]).toMatchObject({ purpose: 'EMAIL_VERIFICATION', email: who.email });
  });

  it('AC-17: um novo link do mesmo tipo invalida o anterior, sem tocar em outro tipo ou outro usuário', async () => {
    const who = await owner(mail('a'));
    const other = await owner(mail('b'));
    const first = await issue(who, who.email);
    const reset = await issue(who, who.email, 'PASSWORD_RESET');
    const othersLink = await issue(other, other.email);

    const second = await issue(who, who.email, 'EMAIL_VERIFICATION', after(10));

    expect(await tokens.find(hashToken(first), after(11))).toBeNull();
    expect(await tokens.find(hashToken(second), after(11))).not.toBeNull();
    expect(await tokens.find(hashToken(reset), after(11))).not.toBeNull();
    expect(await tokens.find(hashToken(othersLink), after(11))).not.toBeNull();
  });

  it('AC-33: vale com 29 min 59 s e não vale com 30 min 00 s', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email));

    expect(await tokens.find(hash, after(30 * 60 - 1))).not.toBeNull();
    expect(await tokens.find(hash, after(30 * 60))).toBeNull();
  });

  it('AC-47: invalidate encerra o link', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email));

    await tokens.invalidate(hash, after(1));

    expect(await tokens.find(hash, after(2))).toBeNull();
  });

  it('AC-4: confirmVerification marca o e-mail como verificado e gasta o link', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email));

    expect(await owners.confirmVerification(hash, after(5))).toEqual(who);

    expect((await owners.getEmail(who.username))!.verifiedAt).toEqual(after(5));
    expect(await tokens.find(hash, after(6))).toBeNull();
    expect(await owners.confirmVerification(hash, after(7))).toBeNull();
  });

  it('AC-23: 2 confirmações simultâneas do mesmo link, exatamente 1 vale', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email));

    const results = await Promise.all(Array.from({ length: 5 }, () => owners.confirmVerification(hash, after(5))));

    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it('só serve para o tipo EMAIL_VERIFICATION (AC-25)', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email, 'PASSWORD_RESET'));
    expect(await owners.confirmVerification(hash, after(5))).toBeNull();
  });

  it('AC-7: link emitido para o e-mail A é recusado depois da troca para B', async () => {
    const who = await owner(mail('a'));
    const hash = hashToken(await issue(who, who.email));
    await owners.changeEmail(who.username, mail('b'));

    expect(await owners.confirmVerification(hash, after(5))).toBeNull();
    expect((await owners.getEmail(who.username))!.verifiedAt).toBeNull();
  });

  it('AC-5: e-mail já verificado por outra loja dá EmailInUseError e o link NÃO é gasto', async () => {
    const email = `dividido-${Date.now()}@x.com`;
    await owner(email, true);
    const who = await owner(email);
    const hash = hashToken(await issue(who, email));

    await expect(owners.confirmVerification(hash, after(5))).rejects.toBeInstanceOf(EmailInUseError);

    expect((await owners.getEmail(who.username))!.verifiedAt).toBeNull();
    expect(await tokens.find(hash, after(6))).not.toBeNull();
  });

  it('AC-5: duas lojas confirmando o mesmo e-mail ao mesmo tempo, só uma verifica', async () => {
    const email = `corrida-${Date.now()}@x.com`;
    const a = await owner(email);
    const b = await owner(email);
    const hashA = hashToken(await issue(a, email));
    const hashB = hashToken(await issue(b, email));

    const results = await Promise.allSettled([owners.confirmVerification(hashA, after(5)), owners.confirmVerification(hashB, after(5))]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(EmailInUseError);
  });

  it('AC-6: changeEmail devolve o anterior e deixa o novo não verificado; isVerifiedByAnother enxerga outra conta', async () => {
    const who = await owner(mail('velho'), true);
    const other = await owner(mail('outro'), true);
    const newEmail = mail('novo');

    expect(await owners.changeEmail(who.username, newEmail)).toEqual({ previousEmail: who.email, previousVerified: true });

    expect(await owners.getEmail(who.username)).toMatchObject({ email: newEmail, verifiedAt: null });
    expect(await owners.isVerifiedByAnother(other.email, who.username)).toBe(true);
    expect(await owners.isVerifiedByAnother(other.email, other.username)).toBe(false);
  });

  it('e-mail já usado por outro usuário da mesma loja (índice merchant_id+email) vira EmailInUseError, não erro 500', async () => {
    const who = await owner();
    const email = mail('mesma-loja');
    await database.insert(appUsers).values({ username: `op-${Date.now()}-${n++}`, merchantId: who.merchantId, passwordHash: 'x', email });

    await expect(owners.setUnverifiedEmail(who.username, email)).rejects.toBeInstanceOf(EmailInUseError);
    await expect(owners.changeEmail(who.username, email)).rejects.toBeInstanceOf(EmailInUseError);
    expect((await owners.getEmail(who.username))!.email).toBeNull();
  });

  it('AC-64: conta antiga, sem e-mail nem verificação, continua legível como não verificada', async () => {
    const who = await owner(null);
    expect(await owners.getEmail(who.username)).toEqual({ merchantId: who.merchantId, email: null, verifiedAt: null });
  });

  it('fluxo completo com o banco: pedir, receber o link, confirmar, auditar sem dado sensível', async () => {
    const who = await owner();
    const sender = new InMemoryEmailSender();
    const limiter = new DrizzleRecoveryRequestLimiter(database);
    const recorded = new RecordingAudit();
    const email = `fluxo-${Date.now()}@x.com`;
    const passwordHash = await hashSecret('senha-atual-1');
    const users = { findByUsername: async () => ({ passwordHash }) } as unknown as UserRepository;
    const request = new RequestEmailVerificationUseCase({ limiter, owners, tokens, sender, audit: recorded, users, baseUrl: 'https://app.exemplo.com.br' });
    const confirm = new ConfirmEmailVerificationUseCase({ limiter, owners, audit: recorded });

    await request.execute({ ...who, ip: '203.0.113.9', email: email.toUpperCase(), currentPassword: 'senha-atual-1', now });
    const token = /#token=([\w-]+)/.exec(sender.sent[0].text)![1];

    expect(await confirm.execute({ ip: '203.0.113.9', token, now: after(60) })).toEqual({ email });
    await expect(confirm.execute({ ip: '203.0.113.9', token, now: after(61) })).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    expect((await owners.getEmail(who.username))!.verifiedAt).toEqual(after(60));
    expect(recorded.events.map((e) => e.eventType)).toEqual(['ACCESS_RECOVERY_REQUESTED', 'OWNER_EMAIL_VERIFIED']);
  });
});
