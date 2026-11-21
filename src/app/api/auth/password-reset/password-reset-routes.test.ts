import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  InvalidEmailError,
  InvalidNewPasswordError,
  InvalidOrExpiredLinkError,
  RecoveryRateLimitedError,
} from '@/modules/users/domain/errors';
import { POST as requestPost, maxDuration } from './request/route';
import { POST as inspectPost } from './inspect/route';
import { POST as confirmPost } from './confirm/route';

// The use cases have their own tests. Here: the HTTP contract, the neutral answer and what is never exposed.
const services = {
  requestPasswordReset: { execute: vi.fn() },
  inspectPasswordReset: { execute: vi.fn() },
  resetPassword: { execute: vi.fn() },
};
const buildRecoveryServices = vi.fn((defer?: unknown) => {
  void defer;
  return services;
});
vi.mock('@/modules/users/infrastructure/recovery-services', () => ({
  buildRecoveryServices: (defer?: unknown) => buildRecoveryServices(defer),
}));

const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));

const captureException = vi.fn();
const flush = vi.fn().mockResolvedValue(true);
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => captureException(e), flush: (ms: number) => flush(ms) }));

const TOKEN = 'token-secreto-do-link-0123456789abcdefghijklmnop';
const M1 =
  'Se este e-mail estiver cadastrado e confirmado, enviaremos um link em alguns minutos. Ele vale 30 minutos. Não chegou? Veja a caixa de spam.';

function call(handler: (r: NextRequest) => Promise<Response>, path: string, body: unknown, headers: Record<string, string> = {}) {
  return handler(
    new NextRequest(`http://localhost/api/auth/password-reset/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/auth/password-reset/request', () => {
  it('maxDuration de 30 s, para o envio depois da resposta caber', () => {
    expect(maxDuration).toBe(30);
  });

  it('AC-13: status, corpo e cabeçalhos idênticos para quem existe, não existe e está limitado', async () => {
    services.requestPasswordReset.execute.mockResolvedValue(undefined);

    const responses = [
      await call(requestPost, 'request', { email: 'existe@gmail.com' }),
      await call(requestPost, 'request', { email: 'nao-existe@gmail.com' }),
      await call(requestPost, 'request', { email: 'limitado@gmail.com' }),
    ];

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ message: M1 });
    }
  });

  it('manda e-mail, o primeiro IP do x-forwarded-for e o relógio ao caso de uso; nada do Host', async () => {
    services.requestPasswordReset.execute.mockResolvedValue(undefined);

    await call(requestPost, 'request', { email: 'Maria@Gmail.com' }, { 'x-forwarded-for': '203.0.113.5, 10.0.0.1', host: 'evil.example' });

    expect(services.requestPasswordReset.execute).toHaveBeenCalledWith({ email: 'Maria@Gmail.com', ip: '203.0.113.5', now: expect.any(Date) });
  });

  it('a rota entrega o after() ao caso de uso: a tarefa roda depois da resposta e o Sentry é esvaziado', async () => {
    services.requestPasswordReset.execute.mockResolvedValue(undefined);
    await call(requestPost, 'request', { email: 'maria@gmail.com' });
    const defer = buildRecoveryServices.mock.calls[0][0] as (task: () => Promise<void>) => void;
    const task = vi.fn().mockResolvedValue(undefined);

    defer(task);
    expect(task).not.toHaveBeenCalled();
    await afterCallbacks[0]();

    expect(task).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(2000);
  });

  it('AC-38: IP limitado é 429 com Retry-After', async () => {
    services.requestPasswordReset.execute.mockRejectedValue(new RecoveryRateLimitedError(120));

    const res = await call(requestPost, 'request', { email: 'maria@gmail.com' });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('120');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('e-mail com formato inválido é 400 com a mensagem; corpo errado é 400 sem chamar o caso de uso', async () => {
    services.requestPasswordReset.execute.mockRejectedValue(new InvalidEmailError());
    const invalid = await call(requestPost, 'request', { email: 'x' });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).message).toBe('E-mail inválido');

    services.requestPasswordReset.execute.mockClear();
    expect((await call(requestPost, 'request', { email: 42 })).status).toBe(400);
    expect((await call(requestPost, 'request', {})).status).toBe(400);
    expect(services.requestPasswordReset.execute).not.toHaveBeenCalled();
  });

  it('erro inesperado é 500 genérico, sem o e-mail na resposta nem no log', async () => {
    services.requestPasswordReset.execute.mockRejectedValue(new Error('boom maria@gmail.com'));

    const res = await call(requestPost, 'request', { email: 'maria@gmail.com' });

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('maria');
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('maria');
  });
});

describe('POST /api/auth/password-reset/inspect', () => {
  it('AC-18 e AC-36: link válido responde ok, no-store, e o token vem só do corpo', async () => {
    services.inspectPasswordReset.execute.mockResolvedValue(undefined);

    const res = await call(inspectPost, 'inspect', { token: TOKEN }, { 'x-forwarded-for': '203.0.113.5' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services.inspectPasswordReset.execute).toHaveBeenCalledWith({ ip: '203.0.113.5', token: TOKEN, now: expect.any(Date) });
  });

  it('token na query, e não no corpo, não vale', async () => {
    const res = await inspectPost(new NextRequest(`http://localhost/api/auth/password-reset/inspect?token=${TOKEN}`, { method: 'POST' }));

    expect(res.status).toBe(400);
    expect(services.inspectPasswordReset.execute).not.toHaveBeenCalled();
  });

  it('AC-22/35: link recusado é 400 com a mensagem única, sem o token', async () => {
    services.inspectPasswordReset.execute.mockRejectedValue(new InvalidOrExpiredLinkError());

    const res = await call(inspectPost, 'inspect', { token: TOKEN });

    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"message":"Link inválido ou vencido. Peça um novo."}');
    expect(text).not.toContain(TOKEN);
  });

  it('AC-41: IP limitado é 429 com Retry-After', async () => {
    services.inspectPasswordReset.execute.mockRejectedValue(new RecoveryRateLimitedError(300));

    const res = await call(inspectPost, 'inspect', { token: TOKEN });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('300');
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  const body = { token: TOKEN, password: 'senha-nova-123', confirmPassword: 'senha-nova-123' };

  it('AC-19: grava e responde ok, no-store; a rota entrega o after() para o aviso', async () => {
    services.resetPassword.execute.mockResolvedValue(undefined);

    const res = await call(confirmPost, 'confirm', body, { 'x-forwarded-for': '203.0.113.5' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(services.resetPassword.execute).toHaveBeenCalledWith({ ip: '203.0.113.5', ...body, now: expect.any(Date) });
    expect(typeof buildRecoveryServices.mock.calls[0][0]).toBe('function');
  });

  it('AC-20: erro do campo é 400 com a mensagem do campo', async () => {
    services.resetPassword.execute.mockRejectedValue(new InvalidNewPasswordError('As senhas não conferem.'));

    const res = await call(confirmPost, 'confirm', { ...body, confirmPassword: 'outra' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'As senhas não conferem.' });
  });

  it('AC-22/25: link recusado é 400 com a mensagem única', async () => {
    services.resetPassword.execute.mockRejectedValue(new InvalidOrExpiredLinkError());

    const res = await call(confirmPost, 'confirm', body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'Link inválido ou vencido. Peça um novo.' });
  });

  it('AC-41: IP limitado é 429', async () => {
    services.resetPassword.execute.mockRejectedValue(new RecoveryRateLimitedError(300));

    expect((await call(confirmPost, 'confirm', body)).status).toBe(429);
  });

  it('corpo sem token, sem senha ou com tipo errado é 400 sem chamar o caso de uso', async () => {
    for (const bad of [{}, { token: TOKEN }, { ...body, password: 1 }, { password: 'x', confirmPassword: 'x' }]) {
      expect((await call(confirmPost, 'confirm', bad)).status).toBe(400);
    }
    expect(services.resetPassword.execute).not.toHaveBeenCalled();
  });

  it('erro inesperado é 500 genérico, sem a senha nem o token na resposta ou no log', async () => {
    services.resetPassword.execute.mockRejectedValue(new Error(`boom ${body.password} ${TOKEN}`));

    const res = await call(confirmPost, 'confirm', body);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(body.password);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain(body.password);
    expect(logged).not.toContain(TOKEN);
  });
});
