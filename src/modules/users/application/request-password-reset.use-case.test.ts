import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';
import { InMemoryPasswordResetStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { EmailDeliveryError } from '../domain/email-sender.port';
import { InvalidEmailError, RecoveryRateLimitedError } from '../domain/errors';
import { hashToken } from '../domain/recovery-token';

const now = new Date('2026-11-21T12:00:00Z');
const EMAIL = 'maria@gmail.com';
const BASE_URL = 'https://meucomercio.example';

let store: InMemoryPasswordResetStore;
let limiter: StubRecoveryLimiter;
let sender: InMemoryEmailSender;
let audit: RecordingAudit;
let tasks: Array<() => Promise<void>>;
let reportError: Mock<(error: unknown) => void>;

const runTasks = async () => {
  for (const task of tasks.splice(0)) await task();
};

function build(deps: Partial<ConstructorParameters<typeof RequestPasswordResetUseCase>[0]> = {}) {
  return new RequestPasswordResetUseCase({
    limiter, resets: store, tokens: store, sender, audit, baseUrl: BASE_URL,
    defer: (task) => { tasks.push(task); },
    reportError,
    ...deps,
  });
}
const request = (email: string, ip = '1.2.3.4') => build().execute({ email, ip, now });

beforeEach(() => {
  store = new InMemoryPasswordResetStore();
  store.addAccount('dona', { email: EMAIL, verifiedAt: now });
  limiter = new StubRecoveryLimiter();
  sender = new InMemoryEmailSender();
  audit = new RecordingAudit();
  tasks = [];
  reportError = vi.fn<(error: unknown) => void>();
});

describe('RequestPasswordResetUseCase', () => {
  it('AC-12: com e-mail confirmado (caixa e espaços não importam), o e-mail sai só depois da tarefa adiada', async () => {
    await request('  Maria@GMAIL.com ');

    expect(sender.sent).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
    await runTasks();

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(EMAIL);
    expect(store.tokens[0]).toMatchObject({ purpose: 'PASSWORD_RESET', email: EMAIL, username: 'dona' });
  });

  it('AC-16 e AC-67: loja, validade, "ignore", link com a URL base fixa, multipart e sem dado da conta', async () => {
    await request(EMAIL);
    await runTasks();

    const mail = sender.sent[0];
    expect(mail.subject).toBe('Meu Comércio: redefinir sua senha');
    expect(mail.text).toContain('Loja da Maria');
    expect(mail.text).toContain('O link vale 30 minutos.');
    expect(mail.text).toContain('Se não foi você, ignore este e-mail: sua senha não muda.');
    expect(mail.text).toContain(`${BASE_URL}/redefinir-senha#token=`);
    expect(mail.html).toContain(`${BASE_URL}/redefinir-senha#token=`);
    expect(mail.html).not.toMatch(/<img/i);
    expect(mail.text + mail.html).not.toContain('old-hash');
    expect(mail.text + mail.html).not.toContain('dona');
  });

  it('o link enviado tem o token cujo hash está no banco, e só o hash', async () => {
    await request(EMAIL);
    await runTasks();

    const token = /#token=([\w-]+)/.exec(sender.sent[0].text)![1];
    expect(store.tokens[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(store.tokens)).not.toContain(token);
  });

  it.each([
    ['e-mail inexistente', () => {}, 'ninguem@gmail.com'],
    ['e-mail ainda não confirmado', () => store.addAccount('dona', { email: EMAIL, verifiedAt: null }), EMAIL],
    ['e-mail de operadora (AC-56)', () => store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { isOwner: false }), EMAIL],
    ['conta desativada', () => store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { enabled: false }), EMAIL],
  ])('AC-14 e AC-61: %s não envia nada e não grava link nem auditoria', async (_name, arrange, email) => {
    arrange();

    await request(email);
    await runTasks();

    expect(sender.sent).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each(['ACCOUNT_LIMITED', 'EMAIL_LIMITED', 'TOO_SOON'] as const)('AC-14, AC-37: %s não envia e responde igual (sem erro)', async (status) => {
    limiter.decision = { status, retryAfterSeconds: 60 };

    await expect(request(EMAIL)).resolves.toBeUndefined();
    await runTasks();

    expect(sender.sent).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
  });

  it('AC-38: IP acima do limite vira 429 com o tempo de espera, para qualquer e-mail', async () => {
    limiter.decision = { status: 'IP_LIMITED', retryAfterSeconds: 120 };

    for (const email of [EMAIL, 'ninguem@gmail.com']) {
      const error = await request(email).catch((e) => e);
      expect(error).toBeInstanceOf(RecoveryRateLimitedError);
      expect(error.retryAfterSeconds).toBe(120);
    }
    expect(sender.sent).toHaveLength(0);
  });

  it('AC-42: teto diário esgotado responde igual, não envia e avisa o Sentry sem dado pessoal', async () => {
    limiter.decision = { status: 'DAILY_LIMITED' };

    await expect(request(EMAIL)).resolves.toBeUndefined();
    await runTasks();

    expect(sender.sent).toHaveLength(0);
    expect(reportError).toHaveBeenCalledTimes(1);
    const reported = reportError.mock.calls[0][0] as EmailDeliveryError;
    expect(reported).toBeInstanceOf(EmailDeliveryError);
    expect(reported.kind).toBe('daily_limit');
    expect(reported.message).not.toContain(EMAIL);
  });

  it('caminho síncrono igual: mesmas chamadas ao limite, só a chave da conta muda; e-mail inválido é recusado antes', async () => {
    await request(EMAIL, '9.9.9.9');
    await request('ninguem@gmail.com', '9.9.9.9');

    expect(limiter.reserved).toEqual([
      { accountKey: 'dona', ipKey: '9.9.9.9', targetKey: EMAIL, enforceResend: true },
      { accountKey: 'pwd-reset:ninguem@gmail.com', ipKey: '9.9.9.9', targetKey: 'ninguem@gmail.com', enforceResend: true },
    ]);
    await expect(request('sem-arroba')).rejects.toBeInstanceOf(InvalidEmailError);
    expect(limiter.reserved).toHaveLength(2);
  });

  it('AC-24: conta bloqueada por senha pode pedir o link', async () => {
    store.addAccount('dona', { email: EMAIL, verifiedAt: now }, { lockedUntil: new Date(now.getTime() + 600_000), failedLoginAttempts: 5 });

    await request(EMAIL);
    await runTasks();

    expect(sender.sent).toHaveLength(1);
  });

  it('AC-17: um segundo pedido invalida o link anterior', async () => {
    await request(EMAIL);
    await runTasks();
    const first = store.tokens[0].tokenHash;

    await request(EMAIL);
    await runTasks();

    expect(await store.find(first, now)).toBeNull();
    expect(await store.find(store.tokens[1].tokenHash, now)).not.toBeNull();
  });

  it('AC-47: falha do envio invalida o link, audita, avisa o Sentry com texto fixo e o pedido segue normal', async () => {
    sender.failWith(new EmailDeliveryError('rejected', 401));

    await expect(request(EMAIL)).resolves.toBeUndefined();
    await runTasks();

    expect(await store.find(store.tokens[0].tokenHash, now)).toBeNull();
    expect(audit.events.map((e) => e.eventType)).toEqual(['ACCESS_RECOVERY_REQUESTED', 'ACCESS_RECOVERY_EMAIL_FAILED']);
    expect(audit.events[1].details).toEqual({ purpose: 'PASSWORD_RESET', code: 'rejected', email: 'm***@gmail.com' });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect((reportError.mock.calls[0][0] as Error).message).toBe('E-mail delivery failed');
  });

  it('AC-49: sem APP_BASE_URL é falha de envio (link invalidado), não erro para quem pediu', async () => {
    const useCase = build({ baseUrl: undefined });

    await expect(useCase.execute({ email: EMAIL, ip: '1.1.1.1', now })).resolves.toBeUndefined();
    await runTasks();

    expect(sender.sent).toHaveLength(0);
    expect(await store.find(store.tokens[0].tokenHash, now)).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('AC-59 e AC-60: auditoria da loja só com purpose e e-mail mascarado', async () => {
    await request(EMAIL);
    await runTasks();

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      merchantId: 'merchant-1', eventType: 'ACCESS_RECOVERY_REQUESTED', actorId: 'dona',
      aggregateType: 'MERCHANT', aggregateId: 'merchant-1',
      details: { purpose: 'PASSWORD_RESET', email: 'm***@gmail.com' },
    });
    const token = /#token=([\w-]+)/.exec(sender.sent[0].text)![1];
    const dump = JSON.stringify(audit.events);
    for (const secret of [EMAIL, token, 'redefinir-senha', 'old-hash', '1.2.3.4']) expect(dump).not.toContain(secret);
  });

  it('o Sentry nunca recebe o erro cru do banco ou do envio (e-mail e hash na mensagem)', async () => {
    const leak = new Error(`insert into owner_recovery_tokens values ('${EMAIL}', 'hash-do-token')`);
    vi.spyOn(store, 'issue').mockRejectedValueOnce(leak);
    await request(EMAIL);
    await runTasks();
    sender.failWith(leak);
    await request(EMAIL);
    await runTasks();

    expect(reportError).toHaveBeenCalledTimes(2);
    for (const [reported] of reportError.mock.calls) {
      expect(reported).not.toBe(leak);
      expect((reported as Error).message).not.toMatch(/maria|hash-do-token/);
    }
  });

  it('se invalidar o link falhar na falha do envio, o erro original do envio é o que vai ao Sentry', async () => {
    const original = new EmailDeliveryError('timeout');
    sender.failWith(original);
    vi.spyOn(store, 'invalidate').mockRejectedValue(new Error('db fora'));

    await request(EMAIL);
    await runTasks();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(original);
  });

  describe('AC-15: o tempo de resposta não revela se o e-mail existe', () => {
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

    async function timeRequests(email: string, runs: number, includeDeferred: boolean) {
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        const started = performance.now();
        await request(email);
        if (includeDeferred) await runTasks();
        times.push(performance.now() - started);
      }
      tasks.length = 0;
      return median(times);
    }

    it('30 pedidos com e-mail existente e 30 com inexistente: a diferença das medianas é menor que 150 ms', async () => {
      sender.delayMs = 300;

      const existing = await timeRequests(EMAIL, 30, false);
      const missing = await timeRequests('ninguem@gmail.com', 30, false);

      expect(Math.abs(existing - missing)).toBeLessThan(150);
    }, 30_000);

    it('controle: se o envio ficasse no caminho da resposta (sem defer), o critério falharia', async () => {
      sender.delayMs = 300;

      const existing = await timeRequests(EMAIL, 5, true);
      const missing = await timeRequests('ninguem@gmail.com', 5, true);

      expect(Math.abs(existing - missing)).toBeGreaterThanOrEqual(150);
    }, 30_000);
  });
});
