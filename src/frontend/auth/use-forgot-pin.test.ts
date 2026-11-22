import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const countdown = vi.hoisted(() => ({ start: vi.fn(), seconds: 0 }));
vi.mock('@/frontend/lib/use-resend-countdown', () => ({
  useResendCountdown: () => countdown,
}));

const api = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  requestPinReset: vi.fn(),
}));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: api,
}));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useForgotPassword } from './use-forgot-password';

beforeEach(() => {
  vi.clearAllMocks();
  api.requestPinReset.mockResolvedValue({
    message: 'texto diferente do servidor',
  });
});

const setup = () => mountHook(() => useForgotPassword('pin'));

describe('useForgotPassword("pin")', () => {
  it('AC-27: pede o link do PIN (não o da senha) e mostra "enviado" com a espera de 60 s', async () => {
    const hook = setup();
    hook.current().setEmail('maria@gmail.com');
    await hook.current().submit();

    expect(api.requestPinReset).toHaveBeenCalledWith('maria@gmail.com');
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'sent' });
    expect(countdown.start).toHaveBeenCalledTimes(1);
  });

  it('AC-11: honeypot preenchido não chama a API e mostra a mesma tela de enviado', async () => {
    const hook = setup();
    hook.current().setHoneypot('http://spam');
    await hook.current().submit();

    expect(api.requestPinReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'sent' });
  });

  it('erro de formato (400) fica no formulário e 429 vira a mensagem de limite', async () => {
    api.requestPinReset.mockRejectedValueOnce(new ApiError(400, 'Informe um e-mail válido.'));
    const hook = setup();
    await hook.current().submit();
    expect(hook.current().phase).toEqual({
      name: 'form',
      error: 'Informe um e-mail válido.',
    });

    api.requestPinReset.mockRejectedValueOnce(new ApiError(429, 'qualquer'));
    await hook.current().submit();
    expect(hook.current().phase).toEqual({
      name: 'form',
      error: 'Muitas tentativas. Tente de novo mais tarde.',
    });
  });
});
