import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeOwnerEmailUseCase } from './change-owner-email.use-case';
import { InMemoryEmailSender } from '../testing/in-memory-email-sender';
import { InMemoryRecoveryStore, RecordingAudit, StubRecoveryLimiter } from '../testing/recovery-fakes';
import { hashSecret } from '../domain/password';
import { EmailDeliveryError } from '../domain/email-sender.port';
import { EmailInUseError, EmailSendFailedError, InvalidCurrentPasswordError, InvalidEmailError } from '../domain/errors';
import type { UserRepository } from '../domain/user-repository.port';

const now = new Date('2026-11-21T12:00:00Z');
const OLD = 'antigo@gmail.com';
const NEW = 'novo@gmail.com';

let store: InMemoryRecoveryStore;
let limiter: StubRecoveryLimiter;
let sender: InMemoryEmailSender;
let audit: RecordingAudit;
let reported: unknown[];
let passwordHash: string;

function build() {
  const users = { findByUsername: async () => ({ passwordHash }) } as unknown as UserRepository;
  return new ChangeOwnerEmailUseCase({
    limiter, owners: store, tokens: store, sender, audit, users, baseUrl: 'https://app.exemplo.com.br',
    reportError: (e) => reported.push(e),
  });
}

const run = (email = NEW, currentPassword = 'senha-atual-1') =>
  build().execute({ merchantId: 'merchant-1', username: 'dona', ip: '1.2.3.4', email, currentPassword, now });

beforeEach(async () => {
  passwordHash = await hashSecret('senha-atual-1');
  store = new InMemoryRecoveryStore();
  store.addUser('dona', { email: OLD, verifiedAt: new Date('2026-11-01T00:00:00Z') });
  limiter = new StubRecoveryLimiter();
  sender = new InMemoryEmailSender();
  audit = new RecordingAudit();
  reported = [];
});

describe('ChangeOwnerEmailUseCase', () => {
  it('AC-6: troca o e-mail, deixa o novo não verificado, envia o link ao novo e o aviso ao ANTIGO', async () => {
    const result = await run();

    expect(result).toEqual({ email: NEW });
    expect(store.users.get('dona')).toMatchObject({ email: NEW, verifiedAt: null });
    expect(sender.sent.map((m) => m.to)).toEqual([OLD, NEW]);
    expect(sender.sent[0].subject).toContain('e-mail de recuperação foi alterado');
    expect(sender.sent[0].text).not.toContain(NEW);
    expect(sender.sent[1].text).toContain('#token=');
  });

  it('AC-6: senha atual errada recusa, não troca nada e conta no limite', async () => {
    await expect(run(NEW, 'errada')).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

    expect(store.users.get('dona')!.email).toBe(OLD);
    expect(sender.sent).toHaveLength(0);
    expect(limiter.reserved).toHaveLength(1);
  });

  it('e-mail igual ao atual não muda nada: continua verificado, sem aviso, sem link e sem gastar o limite', async () => {
    const result = await run(OLD);

    expect(result).toEqual({ email: OLD });
    expect(store.users.get('dona')!.verifiedAt).not.toBeNull();
    expect(sender.sent).toHaveLength(0);
    expect(limiter.reserved).toHaveLength(0);
    expect(store.tokens).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('AC-2: e-mail inválido recusa antes de qualquer coisa', async () => {
    await expect(run('sem-arroba')).rejects.toBeInstanceOf(InvalidEmailError);
    expect(limiter.reserved).toHaveLength(0);
  });

  it('AC-5: e-mail verificado por outra loja é recusado', async () => {
    store.addUser('outra', { merchantId: 'merchant-2', email: NEW, verifiedAt: now });
    await expect(run()).rejects.toBeInstanceOf(EmailInUseError);
    expect(store.users.get('dona')!.email).toBe(OLD);
  });

  it('limite recusado não troca nada', async () => {
    limiter.decision = { status: 'ACCOUNT_LIMITED', retryAfterSeconds: 600 };
    await expect(run()).rejects.toMatchObject({ retryAfterSeconds: 600 });
    expect(store.users.get('dona')!.email).toBe(OLD);
  });

  it('não manda aviso quando o e-mail antigo nunca foi verificado', async () => {
    store.addUser('dona', { email: OLD, verifiedAt: null });
    await run();
    expect(sender.sent.map((m) => m.to)).toEqual([NEW]);
  });

  it('AC-46: falha do aviso ao e-mail antigo não desfaz a troca e vai para o relatório de erros', async () => {
    const failure = new EmailDeliveryError('timeout');
    sender.failWith(failure, OLD);

    await run();

    expect(store.users.get('dona')!.email).toBe(NEW);
    expect(sender.sent.map((m) => m.to)).toEqual([NEW]);
    expect(reported).toEqual([failure]);
  });

  it('AC-48: falha do link ao novo e-mail mantém a troca, avisa o antigo e devolve falha de envio', async () => {
    sender.failWith(new EmailDeliveryError('rejected', 500), NEW);

    await expect(run()).rejects.toBeInstanceOf(EmailSendFailedError);

    expect(store.users.get('dona')!.email).toBe(NEW);
    expect(sender.sent.map((m) => m.to)).toEqual([OLD]);
  });

  it('AC-60: a auditoria da troca não traz e-mail completo nem senha', async () => {
    await run();

    expect(audit.events.map((e) => e.eventType)).toContain('OWNER_EMAIL_CHANGED');
    const json = JSON.stringify(audit.events);
    for (const secret of [OLD, NEW, 'senha-atual-1', passwordHash]) expect(json).not.toContain(secret);
  });
});
