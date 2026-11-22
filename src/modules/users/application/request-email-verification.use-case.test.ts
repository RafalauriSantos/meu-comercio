import { describe, it, expect, beforeEach } from 'vitest';
import { RequestEmailVerificationUseCase } from './request-email-verification.use-case';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { InMemoryRecoveryStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { hashToken } from '../domain/recovery-token';
import { hashSecret } from '../domain/password';
import type { UserRepository } from '../domain/user-repository.port';
import { EmailDeliveryError } from '../domain/email-sender.port';
import {
  EmailAlreadyVerifiedError,
  EmailInUseError,
  InvalidCurrentPasswordError,
  EmailSendFailedError,
  InvalidEmailError,
  RecoveryRateLimitedError,
} from '../domain/errors';

const now = new Date('2026-11-21T12:00:00Z');
const BASE_URL = 'https://app.exemplo.com.br';

let store: InMemoryRecoveryStore;
let limiter: StubRecoveryLimiter;
let sender: InMemoryEmailSender;
let audit: RecordingAudit;
let users: UserRepository;
const PASSWORD = 'senha-atual-1';

function build() {
  return new RequestEmailVerificationUseCase({ limiter, owners: store, tokens: store, sender, audit, users, baseUrl: BASE_URL });
}

const run = (email?: string, at = now) =>
  build().execute({ merchantId: 'merchant-1', username: 'dona', ip: '1.2.3.4', email, currentPassword: PASSWORD, now: at });
const tokenOf = (text: string) => /#token=([\w-]+)/.exec(text)![1];

beforeEach(async () => {
  const passwordHash = await hashSecret(PASSWORD);
  users = { findByUsername: async () => ({ passwordHash }) } as unknown as UserRepository;
  store = new InMemoryRecoveryStore();
  store.addUser('dona');
  limiter = new StubRecoveryLimiter();
  sender = new InMemoryEmailSender();
  audit = new RecordingAudit();
});

describe('RequestEmailVerificationUseCase', () => {
  it('AC-1: grava o e-mail como não verificado e envia o link por APP_BASE_URL', async () => {
    const result = await run('  Maria@Gmail.com ');

    expect(result).toEqual({ email: 'maria@gmail.com' });
    expect(store.users.get('dona')).toMatchObject({ email: 'maria@gmail.com', verifiedAt: null });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('maria@gmail.com');
    expect(sender.sent[0].subject).toMatch(/^Meu Comércio: /);
    expect(sender.sent[0].text).toContain(`${BASE_URL}/verificar-email#token=`);
    expect(sender.sent[0].text).toContain('30 minutos');
  });

  it('AC-16/34: o link vem da URL base fixa (barra final ignorada) e só o hash do token é guardado', async () => {
    await new RequestEmailVerificationUseCase({
      limiter, owners: store, tokens: store, sender, audit, users, baseUrl: `${BASE_URL}/`,
    }).execute({ merchantId: 'merchant-1', username: 'dona', ip: '1.2.3.4', email: 'maria@gmail.com', currentPassword: PASSWORD, now });

    const token = tokenOf(sender.sent[0].text);
    expect(sender.sent[0].text).toContain(`${BASE_URL}/verificar-email#token=${token}`);
    expect(store.tokens[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(store.tokens)).not.toContain(token);
    expect(store.tokens[0]).toMatchObject({ purpose: 'EMAIL_VERIFICATION', email: 'maria@gmail.com' });
    expect(store.tokens[0].expiresAt.toISOString()).toBe('2026-11-21T12:30:00.000Z');
  });

  it('AC-2: e-mail inválido não grava, não envia e não gasta o limite', async () => {
    await expect(run('sem-arroba')).rejects.toBeInstanceOf(InvalidEmailError);
    await expect(run(`${'a'.repeat(250)}@b.co`)).rejects.toBeInstanceOf(InvalidEmailError);

    expect(store.users.get('dona')!.email).toBeNull();
    expect(sender.sent).toHaveLength(0);
    expect(limiter.reserved).toHaveLength(0);
  });

  it('AC-10: sem e-mail no pedido, reenvia ao e-mail já gravado e o link anterior deixa de valer', async () => {
    await run('maria@gmail.com');
    const first = tokenOf(sender.sent[0].text);
    await run(undefined, new Date(now.getTime() + 61_000));

    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1].to).toBe('maria@gmail.com');
    expect(await store.find(hashToken(first), new Date(now.getTime() + 62_000))).toBeNull();
    expect(await store.find(hashToken(tokenOf(sender.sent[1].text)), new Date(now.getTime() + 62_000))).not.toBeNull();
  });

  describe('senha atual quando o e-mail muda', () => {
    const ask = (email: string | undefined, currentPassword?: string) =>
      build().execute({ merchantId: 'merchant-1', username: 'dona', ip: '1.2.3.4', email, currentPassword, now });

    it('e-mail novo (conta sem e-mail) sem senha ou com senha errada é recusado, depois de contar o limite e sem gravar', async () => {
      await expect(ask('maria@gmail.com')).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
      await expect(ask('maria@gmail.com', 'errada')).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

      expect(limiter.reserved).toHaveLength(2);
      expect(store.users.get('dona')!.email).toBeNull();
      expect(sender.sent).toHaveLength(0);
    });

    it('e-mail diferente do gravado também exige a senha', async () => {
      store.addUser('dona', { email: 'antigo@gmail.com' });
      await expect(ask('novo@gmail.com')).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
      expect(store.users.get('dona')!.email).toBe('antigo@gmail.com');
      expect(await ask('novo@gmail.com', PASSWORD)).toEqual({ email: 'novo@gmail.com' });
    });

    it('reenvio ao e-mail gravado, sem e-mail no corpo ou igual ao gravado, não pede senha', async () => {
      store.addUser('dona', { email: 'maria@gmail.com' });
      await ask(undefined);
      await ask('  MARIA@gmail.com ');
      expect(sender.sent.map((m) => m.to)).toEqual(['maria@gmail.com', 'maria@gmail.com']);
    });
  });

  it('AC-10: sem e-mail no pedido e sem e-mail gravado é e-mail inválido', async () => {
    await expect(run()).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('AC-10/37/38: limite recusado devolve o tempo de espera e não grava nem envia', async () => {
    limiter.decision = { status: 'TOO_SOON', retryAfterSeconds: 40 };
    await expect(run('maria@gmail.com')).rejects.toMatchObject({ retryAfterSeconds: 40 });
    limiter.decision = { status: 'IP_LIMITED', retryAfterSeconds: 900 };
    await expect(run('maria@gmail.com')).rejects.toBeInstanceOf(RecoveryRateLimitedError);

    expect(store.users.get('dona')!.email).toBeNull();
    expect(sender.sent).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
  });

  it('AC-39: conta o pedido pelo usuário e pelo IP antes de enviar', async () => {
    await run('maria@gmail.com');
    expect(limiter.reserved).toEqual([{ accountKey: 'dona', ipKey: '1.2.3.4', targetKey: 'maria@gmail.com', enforceResend: true }]);
  });

  it('AC-5: e-mail já verificado por outra loja é recusado e o da dona segue como estava', async () => {
    store.addUser('outra', { merchantId: 'merchant-2', email: 'maria@gmail.com', verifiedAt: now });

    await expect(run('maria@gmail.com')).rejects.toBeInstanceOf(EmailInUseError);

    expect(store.users.get('dona')!.email).toBeNull();
    expect(sender.sent).toHaveLength(0);
  });

  it('recusa quando a conta já tem e-mail verificado (a troca é feita com a senha atual)', async () => {
    store.addUser('dona', { email: 'maria@gmail.com', verifiedAt: now });
    await expect(run('outro@gmail.com')).rejects.toBeInstanceOf(EmailAlreadyVerifiedError);
    expect(sender.sent).toHaveLength(0);
  });

  it('AC-48: falha do Brevo invalida o link, audita sem dado pessoal e a falha conta no limite', async () => {
    sender.failWith(new EmailDeliveryError('rejected', 401));

    const error = await run('maria@gmail.com').catch((e) => e);

    expect(error).toBeInstanceOf(EmailSendFailedError);
    expect(error.message).toBe('Não conseguimos enviar agora. Tente de novo em alguns minutos.');
    expect(error.cause).toBeInstanceOf(EmailDeliveryError);
    expect(await store.find(store.tokens[0].tokenHash, now)).toBeNull();
    expect(limiter.reserved).toHaveLength(1);
    expect(audit.events.map((e) => e.eventType)).toEqual(['ACCESS_RECOVERY_REQUESTED', 'ACCESS_RECOVERY_EMAIL_FAILED']);
    expect(audit.events[1].details).toEqual({ purpose: 'EMAIL_VERIFICATION', code: 'rejected', email: 'm***@gmail.com' });
  });

  it('AC-48: se a limpeza do link falhar, o erro relatado continua sendo o do envio', async () => {
    sender.failWith(new EmailDeliveryError('rejected', 401));
    store.invalidate = async () => { throw new Error('db down'); };

    const error = await run('maria@gmail.com').catch((e) => e);

    expect(error).toBeInstanceOf(EmailSendFailedError);
    expect(error.cause).toBeInstanceOf(EmailDeliveryError);
  });

  it('AC-49: sem APP_BASE_URL o pedido falha como falha de envio, sem expor o nome da variável', async () => {
    const error = await new RequestEmailVerificationUseCase({ limiter, owners: store, tokens: store, sender, audit, users, baseUrl: undefined }).execute({ merchantId: 'merchant-1', username: 'dona', ip: '1.2.3.4', email: 'maria@gmail.com', currentPassword: PASSWORD, now }).catch((e) => e);

    expect(error).toBeInstanceOf(EmailSendFailedError);
    expect(error.cause).toMatchObject({ kind: 'not_configured' });
    expect(error.message).not.toContain('APP_BASE_URL');
    expect(sender.sent).toHaveLength(0);
  });

  it('AC-42: teto diário atingido não envia e vira falha de envio com tipo daily_limit', async () => {
    limiter.decision = { status: 'DAILY_LIMITED' };

    const error = await run('maria@gmail.com').catch((e) => e);

    expect(error).toBeInstanceOf(EmailSendFailedError);
    expect(error.cause).toMatchObject({ kind: 'daily_limit' });
    expect(sender.sent).toHaveLength(0);
  });

  it('AC-60: a auditoria guarda só purpose e o e-mail mascarado, nunca e-mail, link ou token', async () => {
    await run('maria@gmail.com');

    const [event] = audit.events;
    expect(event).toMatchObject({
      merchantId: 'merchant-1', eventType: 'ACCESS_RECOVERY_REQUESTED', actorId: 'dona',
      aggregateType: 'MERCHANT', aggregateId: 'merchant-1',
      details: { purpose: 'EMAIL_VERIFICATION', email: 'm***@gmail.com' },
    });
    const json = JSON.stringify(audit.events);
    expect(json).not.toContain('maria@gmail.com');
    expect(json).not.toContain(tokenOf(sender.sent[0].text));
  });
});
