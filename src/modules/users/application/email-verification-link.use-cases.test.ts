import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InspectEmailVerificationUseCase } from './inspect-email-verification.use-case';
import { ConfirmEmailVerificationUseCase } from './confirm-email-verification.use-case';
import { InMemoryRecoveryStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { EmailInUseError, InvalidOrExpiredLinkError, RecoveryRateLimitedError } from '../domain/errors';
import type { RecoveryPurpose } from '../domain/recovery-token';

const now = new Date('2026-11-21T12:00:00Z');
const EMAIL = 'maria@gmail.com';

let store: InMemoryRecoveryStore;
let limiter: StubRecoveryLimiter;
let audit: RecordingAudit;

async function issue(purpose: RecoveryPurpose = 'EMAIL_VERIFICATION', email = EMAIL) {
  const token = generateRecoveryToken();
  await store.issue({
    merchantId: 'merchant-1', username: 'dona', purpose, email, tokenHash: hashToken(token),
    expiresAt: recoveryTokenExpiresAt(now), now,
  });
  return token;
}

const inspect = (token: string, at = now) =>
  new InspectEmailVerificationUseCase({ limiter, owners: store, tokens: store }).execute({ ip: '1.2.3.4', token, now: at });
const confirm = (token: string, at = now) =>
  new ConfirmEmailVerificationUseCase({ limiter, owners: store, audit }).execute({ ip: '1.2.3.4', token, now: at });

beforeEach(() => {
  store = new InMemoryRecoveryStore();
  store.addUser('dona', { email: EMAIL });
  limiter = new StubRecoveryLimiter();
  audit = new RecordingAudit();
});

describe('InspectEmailVerificationUseCase', () => {
  it('AC-3: link válido mostra o e-mail e não muda nada', async () => {
    const token = await issue();

    expect(await inspect(token)).toEqual({ email: EMAIL });
    expect(await inspect(token)).toEqual({ email: EMAIL });

    expect(store.users.get('dona')!.verifiedAt).toBeNull();
    expect(store.tokens[0].usedAt).toBeNull();
  });

  it.each([
    ['inexistente', async () => 'token-que-nao-existe'],
    ['de outro tipo', async () => issue('PASSWORD_RESET')],
    ['de e-mail trocado (AC-7)', async () => issue('EMAIL_VERIFICATION', 'outro@gmail.com')],
  ])('AC-22/25/35: link %s dá sempre a mesma mensagem', async (_name, make) => {
    const error = await inspect(await make()).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token', async () => {
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const find = vi.spyOn(store, 'find');

    await expect(inspect(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(find).not.toHaveBeenCalled();
    expect(limiter.tokenAttempts).toEqual(['1.2.3.4']);
  });
});

describe('ConfirmEmailVerificationUseCase', () => {
  it('AC-4: confirma o e-mail, usa o link e audita sem dado sensível', async () => {
    const token = await issue();

    expect(await confirm(token)).toEqual({ email: EMAIL });

    expect(store.users.get('dona')!.verifiedAt).toEqual(now);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      merchantId: 'merchant-1', eventType: 'OWNER_EMAIL_VERIFIED', actorId: 'dona',
      aggregateType: 'MERCHANT', aggregateId: 'merchant-1', details: { purpose: 'EMAIL_VERIFICATION', email: 'm***@gmail.com' },
    });
    expect(JSON.stringify(audit.events)).not.toContain(EMAIL);
    expect(JSON.stringify(audit.events)).not.toContain(token);
  });

  it('AC-22: link usado, aberto ou enviado de novo, é recusado', async () => {
    const token = await issue();
    await confirm(token);

    await expect(confirm(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    await expect(inspect(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('AC-33: vale com 29 min 59 s e é recusado com 30 min 00 s', async () => {
    const token = await issue();
    const inTime = new Date(now.getTime() + (30 * 60 - 1) * 1000);
    const late = new Date(now.getTime() + 30 * 60 * 1000);

    await expect(confirm(token, late)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(await confirm(token, inTime)).toEqual({ email: EMAIL });
  });

  it('AC-7: link emitido para o e-mail A é recusado depois da troca para B', async () => {
    const token = await issue();
    await store.changeEmail('dona', 'b@gmail.com');

    await expect(confirm(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(store.users.get('dona')!.verifiedAt).toBeNull();
  });

  it('AC-5: e-mail já verificado por outra loja é recusado e o link NÃO é gasto', async () => {
    const token = await issue();
    store.addUser('outra', { merchantId: 'merchant-2', email: EMAIL, verifiedAt: now });

    await expect(confirm(token)).rejects.toBeInstanceOf(EmailInUseError);

    expect(store.users.get('dona')!.verifiedAt).toBeNull();
    expect(store.tokens[0].usedAt).toBeNull();
    expect(audit.events).toHaveLength(0);
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token', async () => {
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const confirmation = vi.spyOn(store, 'confirmVerification');

    await expect(confirm(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(confirmation).not.toHaveBeenCalled();
  });

  it('AC-17: um novo link do mesmo tipo invalida o anterior', async () => {
    const first = await issue();
    const second = await issue();

    await expect(confirm(first)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(await confirm(second)).toEqual({ email: EMAIL });
  });
});
