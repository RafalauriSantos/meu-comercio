import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { InspectPasswordResetLinkUseCase } from './inspect-password-reset-link.use-case';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { InMemoryPasswordResetStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { isSessionRevoked } from '@/shared/infrastructure/auth/session';
import { InvalidNewPasswordError, InvalidOrExpiredLinkError, RecoveryRateLimitedError } from '../domain/errors';
import { hashSecret, verifySecret } from '../domain/password';
import type { RecoveryPurpose } from '../domain/recovery-token';

const now = new Date('2026-11-21T12:00:00Z');
const EMAIL = 'maria@gmail.com';
const OLD_PASSWORD = 'senha-antiga-1';
const NEW_PASSWORD = 'senha-nova-123';

let store: InMemoryPasswordResetStore;
let limiter: StubRecoveryLimiter;
let audit: RecordingAudit;
let sender: InMemoryEmailSender;
let tasks: Array<() => Promise<void>>;
let reportError: Mock<(error: unknown) => void>;

const runTasks = async () => {
  for (const task of tasks.splice(0)) await task();
};

async function issue(purpose: RecoveryPurpose = 'PASSWORD_RESET', email = EMAIL) {
  const token = generateRecoveryToken();
  await store.issue({
    merchantId: 'merchant-1', username: 'dona', purpose, email, tokenHash: hashToken(token),
    expiresAt: recoveryTokenExpiresAt(now), now,
  });
  return token;
}

const inspect = (token: string, at = now) =>
  new InspectPasswordResetLinkUseCase({ limiter, resets: store, tokens: store }).execute({ ip: '1.2.3.4', token, now: at });
const reset = (token: string, password = NEW_PASSWORD, confirmPassword = password, at = now) =>
  new ResetPasswordUseCase({
    limiter, resets: store, tokens: store, audit, sender,
    defer: (task) => { tasks.push(task); }, reportError,
  }).execute({ ip: '1.2.3.4', token, password, confirmPassword, now: at });

beforeEach(async () => {
  store = new InMemoryPasswordResetStore();
  store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { passwordHash: await hashSecret(OLD_PASSWORD) });
  limiter = new StubRecoveryLimiter();
  audit = new RecordingAudit();
  sender = new InMemoryEmailSender();
  tasks = [];
  reportError = vi.fn<(error: unknown) => void>();
});

describe('InspectPasswordResetLinkUseCase', () => {
  it('AC-18: link válido responde ok e não consome nada', async () => {
    const token = await issue();

    await inspect(token);
    await inspect(token);

    expect(store.tokens[0].usedAt).toBeNull();
  });

  it.each([
    ['inexistente', async () => 'token-que-nao-existe'],
    ['de verificação de e-mail (AC-25)', async () => issue('EMAIL_VERIFICATION')],
    ['de PIN (AC-25)', async () => issue('PIN_RESET')],
    ['de e-mail trocado', async () => issue('PASSWORD_RESET', 'outro@gmail.com')],
  ])('AC-22/25/35: link %s dá sempre a mesma mensagem', async (_name, make) => {
    const error = await inspect(await make()).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it('e-mail da conta que deixou de ser confirmado recusa o link', async () => {
    const token = await issue();
    store.addAccount('dona', { email: EMAIL, verifiedAt: null });

    await expect(inspect(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token', async () => {
    limiter.decision = { status: 'ALLOWED' };
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const find = vi.spyOn(store, 'find');

    await expect(inspect(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(find).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordUseCase', () => {
  it('AC-19 e AC-21: grava bcrypt, usa o link, zera o login e a senha antiga deixa de servir', async () => {
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, {
      passwordHash: await hashSecret(OLD_PASSWORD), failedLoginAttempts: 5, lockedUntil: new Date(now.getTime() + 600_000),
    });
    const token = await issue();

    await reset(token);

    const account = store.accounts.get('dona')!;
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await verifySecret(NEW_PASSWORD, account.passwordHash)).toBe(true);
    expect(await verifySecret(OLD_PASSWORD, account.passwordHash)).toBe(false);
    expect(account).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null, credentialsChangedAt: expect.any(Date) });
    expect(store.tokens[0].usedAt).toEqual(now);
  });

  it('ADR-013: zera o bloqueio de login; o use case não recebe o PIN da loja, que fica como estava', async () => {
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, {
      passwordHash: await hashSecret(OLD_PASSWORD), failedLoginAttempts: 5, lockedUntil: new Date(now.getTime() + 600_000),
    });

    await reset(await issue());

    expect(store.accounts.get('dona')).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it.each([
    ['divergentes', NEW_PASSWORD, 'outra-senha-123'],
    ['curta', 'curta', 'curta'],
    ['longa demais para o bcrypt', 'a'.repeat(73), 'a'.repeat(73)],
    ['igual à atual', OLD_PASSWORD, OLD_PASSWORD],
  ])('AC-20: senha %s não grava, não gasta o link e mostra o erro do campo', async (_name, password, confirm) => {
    const token = await issue();
    const before = store.accounts.get('dona')!.passwordHash;

    const error = await reset(token, password, confirm).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidNewPasswordError);
    expect(error.message).not.toBe('');
    expect(store.tokens[0].usedAt).toBeNull();
    expect(store.accounts.get('dona')!.passwordHash).toBe(before);
    expect(await reset(token)).toBeUndefined();
  });

  it('AC-20: mensagens dos campos', async () => {
    const token = await issue();
    const message = async (password: string, confirm: string) => (await reset(token, password, confirm).catch((e) => e)).message;

    expect(await message(NEW_PASSWORD, 'outra-senha-123')).toBe('As senhas não conferem.');
    expect(await message('curta', 'curta')).toBe('A senha deve ter no mínimo 8 caracteres.');
    expect(await message(OLD_PASSWORD, OLD_PASSWORD)).toBe('A nova senha deve ser diferente da atual.');
  });

  it('AC-22: link usado, aberto ou enviado de novo, é recusado', async () => {
    const token = await issue();
    await reset(token);

    await expect(reset(token, 'mais-uma-senha-9')).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    await expect(inspect(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it.each([
    ['de verificação de e-mail', async () => issue('EMAIL_VERIFICATION')],
    ['de PIN', async () => issue('PIN_RESET')],
    ['inexistente', async () => 'token-que-nao-existe'],
    ['de e-mail trocado', async () => issue('PASSWORD_RESET', 'outro@gmail.com')],
  ])('AC-22/25/35: link %s dá a mesma mensagem e nada muda', async (_name, make) => {
    const token = await make();
    const before = store.accounts.get('dona')!.passwordHash;

    const error = await reset(token).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
    expect(store.accounts.get('dona')!.passwordHash).toBe(before);
    expect(store.tokens.every((t) => t.usedAt === null)).toBe(true);
  });

  it('AC-33: vale com 29 min 59 s e é recusado com 30 min 00 s', async () => {
    const token = await issue();
    const inTime = new Date(now.getTime() + (30 * 60 - 1) * 1000);
    const late = new Date(now.getTime() + 30 * 60 * 1000);

    await expect(reset(token, NEW_PASSWORD, NEW_PASSWORD, late)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    await expect(reset(token, NEW_PASSWORD, NEW_PASSWORD, inTime)).resolves.toBeUndefined();
  });

  it('AC-23: dois envios do mesmo link, só um grava', async () => {
    const token = await issue();

    const results = await Promise.allSettled([reset(token, 'primeira-senha-1'), reset(token, 'segunda-senha-2')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token nem a senha', async () => {
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const find = vi.spyOn(store, 'find');
    const resetPassword = vi.spyOn(store, 'resetPassword');

    await expect(reset(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(find).not.toHaveBeenCalled();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('AC-59 e AC-60: auditoria PASSWORD_RESET_COMPLETED sem dado sensível', async () => {
    const token = await issue();

    await reset(token);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      merchantId: 'merchant-1', eventType: 'PASSWORD_RESET_COMPLETED', actorId: 'dona',
      aggregateType: 'MERCHANT', aggregateId: 'merchant-1',
      details: { purpose: 'PASSWORD_RESET', email: 'm***@gmail.com' },
    });
    const dump = JSON.stringify(audit.events);
    for (const secret of [EMAIL, token, NEW_PASSWORD, OLD_PASSWORD, 'old-hash', '1.2.3.4']) expect(dump).not.toContain(secret);
  });

  it('AC-44: o aviso vai ao e-mail confirmado depois da troca, sem senha, link nem token', async () => {
    const token = await issue();

    await reset(token);
    expect(sender.sent).toHaveLength(0);
    await runTasks();

    expect(sender.sent).toHaveLength(1);
    const notice = sender.sent[0];
    expect(notice.to).toBe(EMAIL);
    expect(notice.subject).toBe('Meu Comércio: sua senha foi alterada');
    expect(notice.text).toContain('21/11/2026');
    for (const secret of [NEW_PASSWORD, OLD_PASSWORD, token, 'redefinir-senha', 'http']) {
      expect(notice.text + notice.html).not.toContain(secret);
    }
  });

  it('AC-46: falha do aviso não desfaz a troca e vai ao Sentry', async () => {
    sender.failWith(new Error('brevo fora do ar'));

    await expect(reset(await issue())).resolves.toBeUndefined();
    await runTasks();

    expect(await verifySecret(NEW_PASSWORD, store.accounts.get('dona')!.passwordHash)).toBe(true);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

});

describe('ResetPasswordUseCase: ajustes de revisão', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('credentials_changed_at é tirado na hora de gravar, não no início do pedido: sessão da janela também cai', async () => {
    const token = await issue();
    const startedWhileRequestRuns = now.getTime() + 2000;
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(now.getTime() + 5000) });

    await reset(token); // `now` of the request is 5 s older than the clock when the password is saved

    const changedAt = store.accounts.get('dona')!.credentialsChangedAt!;
    expect(changedAt.getTime()).toBe(now.getTime() + 5000);
    const session = { username: 'dona', merchantId: 'merchant-1', authorities: ['ROLE_OWNER' as const], expiresAt: 0, startedAt: startedWhileRequestRuns };
    expect(isSessionRevoked(session, changedAt)).toBe(true);
  });

  it('senha de 40 letras acentuadas passa de 72 bytes: recusada com mensagem clara, link intacto', async () => {
    const token = await issue();
    const accented = 'á'.repeat(40);

    const error = await reset(token, accented, accented).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidNewPasswordError);
    expect(error.message).toBe('A senha é longa demais. Use até 72 bytes (letras com acento contam como 2).');
    expect(store.tokens[0].usedAt).toBeNull();
    await expect(reset(token, 'á'.repeat(36))).resolves.toBeUndefined(); // exactly 72 bytes
  });

  it.each([
    ['divergente', NEW_PASSWORD, 'outra-senha-123'],
    ['curta', 'curta', 'curta'],
    ['longa demais', 'a'.repeat(73), 'a'.repeat(73)],
  ])('erro de formulário (%s) não gasta o limite de tentativas do IP nem consulta o token', async (_name, password, confirm) => {
    const find = vi.spyOn(store, 'find');

    await expect(reset(await issue(), password, confirm)).rejects.toBeInstanceOf(InvalidNewPasswordError);

    expect(limiter.tokenAttempts).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('senha válida ainda gasta uma tentativa do IP antes de tocar no token', async () => {
    await reset(await issue());

    expect(limiter.tokenAttempts).toEqual(['1.2.3.4']);
  });

  it('conta desativada com link ainda válido recebe a recusa neutra, no inspect e no reset', async () => {
    const token = await issue();
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { enabled: false });

    await expect(inspect(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    await expect(reset(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('o Sentry nunca recebe o erro cru (e-mail e hash na mensagem): só nome e texto fixo', async () => {
    const leak = new Error(`insert into x values ('${EMAIL}', 'hash-do-token')`);
    leak.name = 'DrizzleQueryError';
    sender.failWith(leak);

    await reset(await issue());
    await runTasks();

    expect(reportError).toHaveBeenCalledTimes(1);
    for (const [reported] of reportError.mock.calls) {
      expect(reported).not.toBe(leak);
      expect(JSON.stringify([(reported as Error).message, (reported as Error).name, (reported as Error).stack?.split('\n')[0]])).not.toMatch(/maria|hash-do-token/);
    }
  });
});
