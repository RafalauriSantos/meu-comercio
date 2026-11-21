import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import type { SessionData } from '@/shared/infrastructure/auth/session';
import {
  EmailInUseError,
  EmailSendFailedError,
  InvalidCurrentPasswordError,
  InvalidEmailError,
  InvalidOrExpiredLinkError,
  RecoveryRateLimitedError,
} from '@/modules/users/domain/errors';
import { EmailDeliveryError } from '@/modules/users/domain/email-sender.port';
import { POST as verificationPost } from './verification/route';
import { GET as emailGet, PUT as emailPut } from './route';
import { POST as inspectPost } from './verification/inspect/route';
import { POST as confirmPost } from './verification/confirm/route';

// The use cases are covered by their own tests. Here: who may call, the HTTP contract and what is never exposed.
const mockSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/infrastructure/auth/auth-context')>();
  return { ...actual, requireAuthSession: () => mockSession() };
});

const services = {
  getOwnerEmailStatus: { execute: vi.fn() },
  requestEmailVerification: { execute: vi.fn() },
  changeOwnerEmail: { execute: vi.fn() },
  inspectEmailVerification: { execute: vi.fn() },
  confirmEmailVerification: { execute: vi.fn() },
};
vi.mock('@/modules/users/infrastructure/recovery-services', () => ({ buildRecoveryServices: () => services }));

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => captureException(e) }));

const owner: SessionData = { username: 'dona', merchantId: 'merchant-1', authorities: ['ROLE_OWNER'], expiresAt: Date.now() + 60_000 };
const operator: SessionData = { username: 'caixa', merchantId: 'merchant-1', authorities: ['ROLE_OPERATOR', 'CREATE_SALE'], expiresAt: Date.now() + 60_000 };

const TOKEN = 'token-secreto-do-link-0123456789abcdefghijklmnop';

function call(handler: (r: NextRequest) => Promise<Response>, method: string, body: unknown, headers: Record<string, string> = {}) {
  return handler(
    new NextRequest('http://localhost/api/owner/email', {
      method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue(owner);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/owner/email/verification', () => {
  it('AC-9: operador recebe 403 e nada é chamado', async () => {
    mockSession.mockResolvedValue(operator);
    const res = await call(verificationPost, 'POST', { email: 'maria@gmail.com' });
    expect(res.status).toBe(403);
    expect(services.requestEmailVerification.execute).not.toHaveBeenCalled();
  });

  it('sem sessão: 401', async () => {
    mockSession.mockRejectedValue(new UnauthorizedError());
    expect((await call(verificationPost, 'POST', {})).status).toBe(401);
  });

  it('AC-1: a dona pede o link; manda usuário, loja e o primeiro IP do x-forwarded-for; resposta no-store', async () => {
    services.requestEmailVerification.execute.mockResolvedValue({ email: 'maria@gmail.com' });

    const res = await call(verificationPost, 'POST', { email: 'maria@gmail.com' }, { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'maria@gmail.com' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services.requestEmailVerification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 'merchant-1', username: 'dona', ip: '203.0.113.5', email: 'maria@gmail.com', now: expect.any(Date) })
    );
  });

  it('repassa a senha atual ao caso de uso e, se ela estiver errada, devolve 403 como o PUT', async () => {
    services.requestEmailVerification.execute.mockRejectedValue(new InvalidCurrentPasswordError());

    const res = await call(verificationPost, 'POST', { email: 'novo@gmail.com', currentPassword: 'errada' });

    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Senha atual incorreta.');
    expect(services.requestEmailVerification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'novo@gmail.com', currentPassword: 'errada' })
    );
  });

  it('reenvio: corpo vazio é aceito (usa o e-mail da conta)', async () => {
    services.requestEmailVerification.execute.mockResolvedValue({ email: 'maria@gmail.com' });
    expect((await call(verificationPost, 'POST', {})).status).toBe(200);
  });

  it('AC-2: e-mail inválido é 400 com a mensagem', async () => {
    services.requestEmailVerification.execute.mockRejectedValue(new InvalidEmailError());
    const res = await call(verificationPost, 'POST', { email: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('E-mail inválido');
  });

  it('corpo com tipo errado é 400 e não chama o caso de uso', async () => {
    expect((await call(verificationPost, 'POST', { email: 42 })).status).toBe(400);
    expect(services.requestEmailVerification.execute).not.toHaveBeenCalled();
  });

  it('AC-10/38: limite devolve 429 com Retry-After e o tempo de espera', async () => {
    services.requestEmailVerification.execute.mockRejectedValue(new RecoveryRateLimitedError(40));

    const res = await call(verificationPost, 'POST', {});

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('40');
    expect(await res.json()).toEqual({ message: 'Aguarde 40 segundos para tentar de novo.', retryAfterSeconds: 40 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('AC-5: e-mail em uso é 409', async () => {
    services.requestEmailVerification.execute.mockRejectedValue(new EmailInUseError());
    const res = await call(verificationPost, 'POST', { email: 'maria@gmail.com' });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Este e-mail já está em uso');
  });

  it('AC-48: falha do Brevo é 503 com texto simples; só o EmailDeliveryError (texto fixo) vai ao Sentry', async () => {
    const cause = new EmailDeliveryError('rejected', 401);
    services.requestEmailVerification.execute.mockRejectedValue(new EmailSendFailedError(cause));

    const res = await call(verificationPost, 'POST', { email: 'maria@gmail.com' });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ message: 'Não conseguimos enviar agora. Tente de novo em alguns minutos.' });
    expect(captureException).toHaveBeenCalledWith(cause);
  });

  it('erro inesperado é 500 genérico, sem detalhe na resposta nem e-mail no log', async () => {
    services.requestEmailVerification.execute.mockRejectedValue(new Error('boom maria@gmail.com'));

    const res = await call(verificationPost, 'POST', { email: 'maria@gmail.com' });

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('maria');
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('maria');
  });
});

describe('GET /api/owner/email', () => {
  const get = () => emailGet();

  it('AC-9: operador recebe 403 e nada é lido', async () => {
    mockSession.mockResolvedValue(operator);
    const res = await get();
    expect(res.status).toBe(403);
    expect(services.getOwnerEmailStatus.execute).not.toHaveBeenCalled();
  });

  it('sem sessão: 401', async () => {
    mockSession.mockRejectedValue(new UnauthorizedError());
    expect((await get()).status).toBe(401);
  });

  it('AC-62/63: a dona recebe o estado do e-mail dela, no-store', async () => {
    services.getOwnerEmailStatus.execute.mockResolvedValue({ email: 'maria@gmail.com', verified: false });

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'maria@gmail.com', verified: false });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services.getOwnerEmailStatus.execute).toHaveBeenCalledWith({ username: 'dona' });
  });

  it('erro inesperado é 500 genérico', async () => {
    services.getOwnerEmailStatus.execute.mockRejectedValue(new Error('boom maria@gmail.com'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('maria');
  });
});

describe('PUT /api/owner/email', () => {
  const body = { email: 'novo@gmail.com', currentPassword: 'senha-atual-1' };

  it('AC-9: operador recebe 403', async () => {
    mockSession.mockResolvedValue(operator);
    expect((await call(emailPut, 'PUT', body)).status).toBe(403);
    expect(services.changeOwnerEmail.execute).not.toHaveBeenCalled();
  });

  it('AC-6: exige e-mail e senha atual no corpo', async () => {
    expect((await call(emailPut, 'PUT', { email: 'novo@gmail.com' })).status).toBe(400);
    expect((await call(emailPut, 'PUT', { currentPassword: 'x' })).status).toBe(400);
    expect(services.changeOwnerEmail.execute).not.toHaveBeenCalled();
  });

  it('troca com sucesso', async () => {
    services.changeOwnerEmail.execute.mockResolvedValue({ email: 'novo@gmail.com' });

    const res = await call(emailPut, 'PUT', body, { 'x-forwarded-for': '203.0.113.5' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'novo@gmail.com' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services.changeOwnerEmail.execute).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 'merchant-1', username: 'dona', ip: '203.0.113.5', ...body })
    );
  });

  it('senha atual errada é 403 sem encerrar a sessão', async () => {
    services.changeOwnerEmail.execute.mockRejectedValue(new InvalidCurrentPasswordError());
    const res = await call(emailPut, 'PUT', body);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Senha atual incorreta.');
  });
});

describe.each([
  ['inspect', inspectPost, 'inspectEmailVerification'],
  ['confirm', confirmPost, 'confirmEmailVerification'],
] as const)('POST /api/owner/email/verification/%s (pública)', (_name, handler, service) => {
  it('AC-3/4: não exige sessão; o token vem no CORPO e só o e-mail volta; no-store', async () => {
    mockSession.mockRejectedValue(new UnauthorizedError());
    services[service].execute.mockResolvedValue({ email: 'maria@gmail.com' });

    const res = await call(handler, 'POST', { token: TOKEN }, { 'x-forwarded-for': '198.51.100.7' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'maria@gmail.com' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services[service].execute).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN, ip: '198.51.100.7', now: expect.any(Date) }));
  });

  it('AC-22/35: link recusado é 400 com sempre a mesma mensagem, sem o token', async () => {
    services[service].execute.mockRejectedValue(new InvalidOrExpiredLinkError());

    const res = await call(handler, 'POST', { token: TOKEN });

    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"message":"Link inválido ou vencido. Peça um novo."}');
    expect(text).not.toContain(TOKEN);
  });

  it('AC-41: IP acima do limite é 429 com Retry-After', async () => {
    services[service].execute.mockRejectedValue(new RecoveryRateLimitedError(3000));
    const res = await call(handler, 'POST', { token: TOKEN });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3000');
  });

  it('sem token no corpo é 400 e nada é chamado', async () => {
    expect((await call(handler, 'POST', {})).status).toBe(400);
    expect(services[service].execute).not.toHaveBeenCalled();
  });

  it('AC-36: o token não vai para o Sentry nem para o log em erro inesperado', async () => {
    services[service].execute.mockRejectedValue(new Error(`falhou com ${TOKEN}`));

    const res = await call(handler, 'POST', { token: TOKEN });

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain(TOKEN);
  });
});

describe('confirm: e-mail em uso', () => {
  it('AC-5: 409 com a mensagem', async () => {
    services.confirmEmailVerification.execute.mockRejectedValue(new EmailInUseError());
    const res = await call(confirmPost, 'POST', { token: TOKEN });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Este e-mail já está em uso');
  });
});
