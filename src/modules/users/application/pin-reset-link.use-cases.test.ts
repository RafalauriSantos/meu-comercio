import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { InspectPasswordResetLinkUseCase } from './inspect-password-reset-link.use-case';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { ResetPinUseCase } from './reset-pin.use-case';
import { InMemoryPasswordResetStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { EmailDeliveryError } from '../domain/email-sender.port';
import { InvalidNewPasswordError, InvalidOrExpiredLinkError, RecoveryRateLimitedError } from '../domain/errors';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt, type RecoveryPurpose } from '../domain/recovery-token';
import { hashSecret, verifySecret } from '../domain/password';
import { isSessionRevoked } from '@/shared/infrastructure/auth/session';

const now = new Date('2026-11-21T12:00:00Z');
const EMAIL = 'maria@gmail.com';
const BASE_URL = 'https://meucomercio.example';
const OLD_PASSWORD = 'senha-antiga-1';
const NEW_PASSWORD = 'senha-nova-123';
const OLD_PIN = '111111';
const NEW_PIN = '654321';

let store: InMemoryPasswordResetStore;
let limiter: StubRecoveryLimiter;
let audit: RecordingAudit;
let sender: InMemoryEmailSender;
let tasks: Array<() => Promise<void>>;
let reportError: Mock<(error: unknown) => void>;
let clear: Mock<(merchantId: string) => Promise<void>>;

const runTasks = async () => {
  for (const task of tasks.splice(0)) await task();
};
const defer = (task: () => Promise<void>) => { tasks.push(task); };

async function issue(purpose: RecoveryPurpose = 'PIN_RESET', email = EMAIL) {
  const token = generateRecoveryToken();
  await store.issue({
    merchantId: 'merchant-1', username: 'dona', purpose, email, tokenHash: hashToken(token),
    expiresAt: recoveryTokenExpiresAt(now), now,
  });
  return token;
}

const requestPin = (email: string, ip = '1.2.3.4') =>
  new RequestPasswordResetUseCase({
    purpose: 'PIN_RESET', limiter, resets: store, tokens: store, sender, audit, baseUrl: BASE_URL, defer, reportError,
  }).execute({ email, ip, now });
const inspectPin = (token: string, at = now) =>
  new InspectPasswordResetLinkUseCase({ purpose: 'PIN_RESET', limiter, resets: store, tokens: store })
    .execute({ ip: '1.2.3.4', token, now: at });
const inspectPassword = (token: string) =>
  new InspectPasswordResetLinkUseCase({ limiter, resets: store, tokens: store }).execute({ ip: '1.2.3.4', token, now });
const resetPassword = (token: string) =>
  new ResetPasswordUseCase({ limiter, resets: store, tokens: store, audit, sender, defer, reportError })
    .execute({ ip: '1.2.3.4', token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, now });
const resetPin = (
  token: string,
  fields: { password?: string; confirmPassword?: string; pin?: string; confirmPin?: string } = {},
  at = now
) => {
  const password = fields.password ?? NEW_PASSWORD;
  const pin = fields.pin ?? NEW_PIN;
  return new ResetPinUseCase({
    limiter, resets: store, tokens: store, audit, sender, pinLock: { clear }, defer, reportError,
  }).execute({
    ip: '1.2.3.4', token, password, confirmPassword: fields.confirmPassword ?? password,
    pin, confirmPin: fields.confirmPin ?? pin, now: at,
  });
};

beforeEach(async () => {
  store = new InMemoryPasswordResetStore();
  store.addAccount('dona', { email: EMAIL, verifiedAt: now }, {
    passwordHash: await hashSecret(OLD_PASSWORD), authorizationPinHash: await hashSecret(OLD_PIN),
  });
  limiter = new StubRecoveryLimiter();
  audit = new RecordingAudit();
  sender = new InMemoryEmailSender();
  tasks = [];
  reportError = vi.fn<(error: unknown) => void>();
  clear = vi.fn<(merchantId: string) => Promise<void>>().mockResolvedValue(undefined);
});

describe('pedido do link de PIN (AC-27, AC-12 a AC-17 com PIN_RESET)', () => {
  it('AC-12: e-mail confirmado recebe o link de PIN só depois da tarefa adiada', async () => {
    await requestPin('  Maria@GMAIL.com ');
    expect(sender.sent).toHaveLength(0);
    await runTasks();

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(EMAIL);
    expect(store.tokens[0]).toMatchObject({ purpose: 'PIN_RESET', email: EMAIL, username: 'dona' });
  });

  it('AC-16, AC-27 e AC-67: loja, "redefinir o PIN", ignore, link /redefinir-pin da URL base, sem imagem nem dado da conta', async () => {
    await requestPin(EMAIL);
    await runTasks();

    const mail = sender.sent[0];
    expect(mail.subject).toBe('Meu Comércio: redefinir seu PIN e sua senha');
    expect(mail.text).toContain('Loja da Maria');
    expect(mail.text).toContain('link para redefinir o PIN');
    expect(mail.text).toContain('Se não foi você, ignore este e-mail: seu PIN e sua senha não mudam.');
    expect(mail.text).toContain(`${BASE_URL}/redefinir-pin#token=`);
    expect(mail.html).toContain(`${BASE_URL}/redefinir-pin#token=`);
    expect(mail.html).not.toMatch(/<img/i);
    for (const secret of ['old-hash', 'dona', OLD_PIN]) expect(mail.text + mail.html).not.toContain(secret);
  });

  it.each([
    ['e-mail inexistente', () => {}, 'ninguem@gmail.com'],
    ['e-mail não confirmado', () => store.addAccount('dona', { email: EMAIL, verifiedAt: null }), EMAIL],
    ['operadora (AC-56, AC-58)', () => store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { isOwner: false }), EMAIL],
    ['conta desativada', () => store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { enabled: false }), EMAIL],
  ])('AC-14: %s não envia, não grava link nem auditoria', async (_name, arrange, email) => {
    arrange();

    await requestPin(email);
    await runTasks();

    expect(sender.sent).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('AC-13: mesmas chamadas ao limite nos dois casos, só a chave da conta muda (prefixo pin-reset)', async () => {
    await requestPin(EMAIL, '9.9.9.9');
    await requestPin('ninguem@gmail.com', '9.9.9.9');

    expect(limiter.reserved).toEqual([
      { accountKey: 'dona', ipKey: '9.9.9.9', targetKey: EMAIL, enforceResend: true },
      { accountKey: 'pin-reset:ninguem@gmail.com', ipKey: '9.9.9.9', targetKey: 'ninguem@gmail.com', enforceResend: true },
    ]);
  });

  it('AC-38: IP acima do limite vira 429', async () => {
    limiter.decision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    await expect(requestPin(EMAIL)).rejects.toBeInstanceOf(RecoveryRateLimitedError);
  });

  it('AC-17: um segundo pedido de PIN invalida o anterior, e não mexe no link de senha', async () => {
    const passwordLink = await issue('PASSWORD_RESET');
    await requestPin(EMAIL);
    await runTasks();
    const first = store.tokens.find((t) => t.purpose === 'PIN_RESET')!.tokenHash;

    await requestPin(EMAIL);
    await runTasks();

    expect(await store.find(first, now)).toBeNull();
    expect(await store.find(hashToken(passwordLink), now)).not.toBeNull();
  });

  it('AC-47: falha do envio invalida o link, audita com purpose PIN_RESET e a resposta segue normal', async () => {
    sender.failWith(new EmailDeliveryError('rejected', 401));

    await expect(requestPin(EMAIL)).resolves.toBeUndefined();
    await runTasks();

    expect(await store.find(store.tokens[0].tokenHash, now)).toBeNull();
    expect(audit.events.map((e) => e.eventType)).toEqual(['ACCESS_RECOVERY_REQUESTED', 'ACCESS_RECOVERY_EMAIL_FAILED']);
    expect(audit.events[0].details).toEqual({ purpose: 'PIN_RESET', email: 'm***@gmail.com' });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('AC-24/ADR-013: conta bloqueada pode pedir o link', async () => {
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { lockedUntil: new Date(now.getTime() + 600_000), failedLoginAttempts: 5 });
    await requestPin(EMAIL);
    await runTasks();
    expect(sender.sent).toHaveLength(1);
  });

  describe('AC-15: o tempo de resposta não revela se o e-mail existe', () => {
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

    async function timeRequests(email: string, runs: number, includeDeferred: boolean) {
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        const started = performance.now();
        await requestPin(email);
        if (includeDeferred) await runTasks();
        times.push(performance.now() - started);
      }
      tasks.length = 0;
      return median(times);
    }

    it('30 pedidos existente e 30 inexistente: diferença das medianas menor que 150 ms', async () => {
      sender.delayMs = 300;
      const existing = await timeRequests(EMAIL, 30, false);
      const missing = await timeRequests('ninguem@gmail.com', 30, false);
      expect(Math.abs(existing - missing)).toBeLessThan(150);
    }, 30_000);

    it('controle: sem defer o critério falharia', async () => {
      sender.delayMs = 300;
      const existing = await timeRequests(EMAIL, 5, true);
      const missing = await timeRequests('ninguem@gmail.com', 5, true);
      expect(Math.abs(existing - missing)).toBeGreaterThanOrEqual(150);
    }, 30_000);
  });
});

describe('inspeção do link de PIN (AC-28, AC-22/25/35)', () => {
  it('AC-28: link válido responde ok e não consome nada', async () => {
    const token = await issue();
    await inspectPin(token);
    await inspectPin(token);
    expect(store.tokens[0].usedAt).toBeNull();
  });

  it.each([
    ['inexistente', async () => 'token-que-nao-existe'],
    ['de verificação de e-mail', async () => issue('EMAIL_VERIFICATION')],
    ['de senha', async () => issue('PASSWORD_RESET')],
    ['de e-mail trocado', async () => issue('PIN_RESET', 'outro@gmail.com')],
  ])('link %s dá sempre a mesma mensagem', async (_name, make) => {
    const error = await inspectPin(await make()).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it('link de PIN não serve na inspeção da senha (mesma mensagem)', async () => {
    const error = await inspectPassword(await issue('PIN_RESET')).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it('conta desativada com link vivo é recusada', async () => {
    const token = await issue();
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { enabled: false });
    await expect(inspectPin(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token', async () => {
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const find = vi.spyOn(store, 'find');
    await expect(inspectPin(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('ResetPinUseCase', () => {
  it('AC-29: grava senha e PIN em bcrypt, usa o link, zera o login e marca credentials_changed_at', async () => {
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, {
      passwordHash: await hashSecret(OLD_PASSWORD), authorizationPinHash: await hashSecret(OLD_PIN),
      failedLoginAttempts: 5, lockedUntil: new Date(now.getTime() + 600_000),
    });
    const token = await issue();

    await resetPin(token);

    const account = store.accounts.get('dona')!;
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(account.authorizationPinHash).toMatch(/^\$2[aby]\$/);
    expect(await verifySecret(NEW_PASSWORD, account.passwordHash)).toBe(true);
    expect(await verifySecret(NEW_PIN, account.authorizationPinHash!)).toBe(true);
    expect(await verifySecret(OLD_PIN, account.authorizationPinHash!)).toBe(false);
    expect(account).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null, credentialsChangedAt: expect.any(Date) });
    expect(store.tokens[0].usedAt).toEqual(now);
  });

  it('AC-29: zera o bloqueio do PIN da loja depois da gravação', async () => {
    const order: string[] = [];
    const resetAndPin = store.resetPasswordAndPin.bind(store);
    vi.spyOn(store, 'resetPasswordAndPin').mockImplementation(async (p) => {
      const done = await resetAndPin(p);
      order.push('commit');
      return done;
    });
    clear.mockImplementation(async () => { order.push('clear'); });

    await resetPin(await issue());

    expect(clear).toHaveBeenCalledWith('merchant-1');
    expect(order).toEqual(['commit', 'clear']);
  });

  it('AC-29: falha ao zerar o bloqueio não desfaz a troca, vai ao Sentry sem dado pessoal, e o aviso sai', async () => {
    clear.mockRejectedValue(new Error(`update owner_pin_attempts ... ${EMAIL} merchant-1`));

    await expect(resetPin(await issue())).resolves.toBeUndefined();
    await runTasks();

    expect(await verifySecret(NEW_PIN, store.accounts.get('dona')!.authorizationPinHash!)).toBe(true);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect((reportError.mock.calls[0][0] as Error).message).not.toMatch(/maria|merchant-1/);
    expect(sender.sent).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
  });

  it('AC-29 atomicidade: falha na gravação não grava nada, não consome o link e não zera o bloqueio', async () => {
    const token = await issue();
    const before = { ...store.accounts.get('dona')! };
    vi.spyOn(store, 'resetPasswordAndPin').mockRejectedValue(new Error('db caiu'));

    await expect(resetPin(token)).rejects.toThrow('db caiu');

    expect(store.accounts.get('dona')).toEqual(before);
    expect(store.tokens[0].usedAt).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(audit.events).toHaveLength(0);
    expect(tasks).toHaveLength(0);
  });

  it.each([
    ['PIN com 5 dígitos', { pin: '12345' }],
    ['PIN com 7 dígitos', { pin: '1234567' }],
    ['PIN com letras', { pin: '12ab56' }],
    ['PIN com espaço', { pin: '123 56' }],
    ['PIN vazio', { pin: '' }],
    ['PINs diferentes', { confirmPin: '000000' }],
    ['senhas diferentes', { confirmPassword: 'outra-senha-123' }],
    ['senha curta', { password: 'curta' }],
    ['senha longa demais', { password: 'a'.repeat(73) }],
    ['senha igual à atual', { password: OLD_PASSWORD }],
  ])('AC-30: %s não grava nada, o link continua vivo e o erro é de campo', async (_name, fields) => {
    const token = await issue();
    const before = { ...store.accounts.get('dona')! };

    const error = await resetPin(token, fields).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidNewPasswordError);
    expect(error.message).not.toBe('');
    expect(store.accounts.get('dona')).toEqual(before);
    expect(store.tokens[0].usedAt).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    await expect(resetPin(token)).resolves.toBeUndefined();
  });

  it('AC-30: a mensagem fala em PIN quando o erro é do PIN', async () => {
    const token = await issue();
    expect((await resetPin(token, { pin: '12345' }).catch((e) => e)).message).toBe('O PIN deve ter exatamente 6 números.');
    expect((await resetPin(token, { confirmPin: '000000' }).catch((e) => e)).message).toBe('Os PINs não conferem.');
  });

  it('erro de formulário não gasta tentativa do IP nem consulta o token; senha válida gasta uma', async () => {
    const find = vi.spyOn(store, 'find');
    await expect(resetPin(await issue(), { pin: '123' })).rejects.toBeInstanceOf(InvalidNewPasswordError);
    expect(limiter.tokenAttempts).toEqual([]);
    expect(find).not.toHaveBeenCalled();

    await resetPin(await issue());
    expect(limiter.tokenAttempts).toEqual(['1.2.3.4']);
  });

  it('AC-41: IP acima do limite recebe 429 sem consultar o token nem gravar', async () => {
    limiter.tokenDecision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };
    const find = vi.spyOn(store, 'find');
    const write = vi.spyOn(store, 'resetPasswordAndPin');

    await expect(resetPin(await issue())).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(find).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ['de senha', async () => issue('PASSWORD_RESET')],
    ['de verificação de e-mail', async () => issue('EMAIL_VERIFICATION')],
    ['inexistente', async () => 'token-que-nao-existe'],
    ['de e-mail trocado', async () => issue('PIN_RESET', 'outro@gmail.com')],
  ])('AC-22/25/35: link %s dá a mesma mensagem e nada muda', async (_name, make) => {
    const token = await make();
    const before = { ...store.accounts.get('dona')! };

    const error = await resetPin(token).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
    expect(store.accounts.get('dona')).toEqual(before);
    expect(store.tokens.every((t) => t.usedAt === null)).toBe(true);
    expect(clear).not.toHaveBeenCalled();
  });

  it('link de PIN não serve para trocar só a senha (mesma mensagem)', async () => {
    const error = await resetPassword(await issue('PIN_RESET')).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(error.message).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it.each([
    ['conta desativada', { enabled: false }],
    ['operadora', { isOwner: false }],
  ])('%s com link vivo é recusada e nada muda', async (_name, account) => {
    const token = await issue();
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { passwordHash: 'old-hash', ...account });

    await expect(resetPin(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);

    expect(store.accounts.get('dona')!.passwordHash).toBe('old-hash');
    expect(clear).not.toHaveBeenCalled();
  });

  it('e-mail que deixou de ser o confirmado recusa o link', async () => {
    const token = await issue();
    store.addAccount('dona', { email: 'novo@gmail.com', verifiedAt: now });
    await expect(resetPin(token)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
  });

  it('AC-33: vale com 29 min 59 s e é recusado com 30 min 00 s', async () => {
    const token = await issue();
    const inTime = new Date(now.getTime() + (30 * 60 - 1) * 1000);
    const late = new Date(now.getTime() + 30 * 60 * 1000);

    await expect(resetPin(token, {}, late)).rejects.toBeInstanceOf(InvalidOrExpiredLinkError);
    await expect(resetPin(token, {}, inTime)).resolves.toBeUndefined();
  });

  it('AC-23: dois envios do mesmo link, só um grava', async () => {
    const token = await issue();

    const results = await Promise.allSettled([
      resetPin(token, { pin: '111222' }),
      resetPin(token, { pin: '333444' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(InvalidOrExpiredLinkError);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('AC-52/53: credentials_changed_at é tirado na hora de gravar e derruba a sessão que começou durante o pedido', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(now.getTime() + 5000) });
    try {
      await resetPin(await issue());
    } finally {
      vi.useRealTimers();
    }

    const changedAt = store.accounts.get('dona')!.credentialsChangedAt!;
    expect(changedAt.getTime()).toBe(now.getTime() + 5000);
    const session = { username: 'dona', merchantId: 'merchant-1', authorities: ['ROLE_OWNER' as const], expiresAt: 0, startedAt: now.getTime() + 2000 };
    expect(isSessionRevoked(session, changedAt)).toBe(true);
  });

  it('AC-59/60/61: auditoria OWNER_PIN_RESET_COMPLETED sem dado sensível', async () => {
    const token = await issue();

    await resetPin(token);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      merchantId: 'merchant-1', eventType: 'OWNER_PIN_RESET_COMPLETED', actorId: 'dona',
      aggregateType: 'MERCHANT', aggregateId: 'merchant-1',
      details: { purpose: 'PIN_RESET', email: 'm***@gmail.com' },
    });
    const dump = JSON.stringify(audit.events);
    for (const secret of [EMAIL, token, NEW_PASSWORD, OLD_PASSWORD, NEW_PIN, OLD_PIN, 'old-hash', '1.2.3.4']) {
      expect(dump).not.toContain(secret);
    }
  });

  it('AC-44: o aviso diz "senha e PIN", vai ao e-mail confirmado depois da troca e não traz senha, PIN, link nem token', async () => {
    const token = await issue();

    await resetPin(token);
    expect(sender.sent).toHaveLength(0);
    await runTasks();

    expect(sender.sent).toHaveLength(1);
    const notice = sender.sent[0];
    expect(notice.to).toBe(EMAIL);
    expect(notice.subject).toBe('Meu Comércio: sua senha e seu PIN foram alterados');
    expect(notice.text).toContain('21/11/2026');
    for (const secret of [NEW_PASSWORD, OLD_PASSWORD, NEW_PIN, OLD_PIN, token, 'redefinir-pin', 'http']) {
      expect(notice.text + notice.html).not.toContain(secret);
    }
  });

  it('AC-46: falha do aviso não desfaz a troca e vai ao Sentry', async () => {
    sender.failWith(new Error('brevo fora do ar'));

    await expect(resetPin(await issue())).resolves.toBeUndefined();
    await runTasks();

    expect(await verifySecret(NEW_PIN, store.accounts.get('dona')!.authorizationPinHash!)).toBe(true);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('nenhum PIN, senha ou token chega ao Sentry quando o banco falha com os valores na mensagem', async () => {
    const token = await issue();
    const leak = new Error(`update app_users set authorization_pin_hash = '${NEW_PIN}' ${NEW_PASSWORD} ${token}`);
    leak.name = 'DrizzleQueryError';
    clear.mockRejectedValue(leak);
    sender.failWith(leak);

    await resetPin(token);
    await runTasks();

    expect(reportError).toHaveBeenCalledTimes(2);
    for (const [reported] of reportError.mock.calls) {
      expect(reported).not.toBe(leak);
      const dump = JSON.stringify([(reported as Error).message, (reported as Error).name]);
      for (const secret of [NEW_PIN, NEW_PASSWORD, token]) expect(dump).not.toContain(secret);
    }
  });
});

describe('AC-28: não existe caminho que troque só o PIN', () => {
  const methods = (file: string) =>
    [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/^ {2}(?:async |private )*(\w+)\(/gm)].map((m) => m[1]).filter((name) => name !== 'constructor').sort();

  it('a porta só tem as consultas, resetPassword e resetPasswordAndPin', () => {
    expect(methods('../domain/password-reset-repository.port.ts')).toEqual([
      'findOwnerByVerifiedEmail', 'getCredentials', 'resetPassword', 'resetPasswordAndPin',
    ]);
  });

  it('o adaptador Drizzle só tem esses métodos e o helper privado, que exige a senha', () => {
    expect(methods('../infrastructure/drizzle-password-reset-repository.ts')).toEqual([
      'findOwnerByVerifiedEmail', 'getCredentials', 'resetPassword', 'resetPasswordAndPin', 'useLinkAndUpdate',
    ]);
  });

  it('o tipo do método exige a senha junto com o PIN', () => {
    const port = readFileSync(new URL('../domain/password-reset-repository.port.ts', import.meta.url), 'utf8');
    expect(port).toMatch(/resetPasswordAndPin\(params: \{\s*tokenHash: string;\s*passwordHash: string;\s*pinHash: string;/);
  });
});
