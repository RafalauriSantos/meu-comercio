import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const countdown = vi.hoisted(() => ({ start: vi.fn(), seconds: 0 }));
vi.mock('@/frontend/lib/use-resend-countdown', () => ({ useResendCountdown: () => countdown }));

const api = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<object>()), apiClient: api }));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useForgotPassword } from './use-forgot-password';

beforeEach(() => {
  vi.clearAllMocks();
  api.requestPasswordReset.mockResolvedValue({ message: 'texto diferente do servidor' });
});

const setup = () => mountHook(() => useForgotPassword());

describe('useForgotPassword', () => {
  it('AC-12/13: envia o e-mail, mostra "enviado" (a M1 é fixa na tela) e inicia a espera de 60 s', async () => {
    const hook = setup();
    hook.current().setEmail('Maria@Gmail.com ');
    await hook.current().submit();

    expect(api.requestPasswordReset).toHaveBeenCalledWith('Maria@Gmail.com ');
    expect(hook.current().phase).toEqual({ name: 'sent' });
    expect(countdown.start).toHaveBeenCalledTimes(1);
  });

  it('AC-11: honeypot preenchido não chama a API e mostra a mesma tela de enviado', async () => {
    const hook = setup();
    hook.current().setEmail('maria@gmail.com');
    hook.current().setHoneypot('http://spam');
    await hook.current().submit();

    expect(api.requestPasswordReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'sent' });
    expect(countdown.start).toHaveBeenCalledTimes(1);
  });

  it('erro de formato (400) mostra a mensagem do servidor e fica no formulário', async () => {
    api.requestPasswordReset.mockRejectedValue(new ApiError(400, 'Informe um e-mail válido.'));
    const hook = setup();
    hook.current().setEmail('x');
    await hook.current().submit();

    expect(hook.current().phase).toEqual({ name: 'form', error: 'Informe um e-mail válido.' });
    expect(countdown.start).not.toHaveBeenCalled();
  });

  it('AC-41: 429 vira "Muitas tentativas. Tente de novo mais tarde."', async () => {
    api.requestPasswordReset.mockRejectedValue(new ApiError(429, 'qualquer'));
    const hook = setup();
    hook.current().setEmail('maria@gmail.com');
    await hook.current().submit();

    expect(hook.current().phase).toEqual({ name: 'form', error: 'Muitas tentativas. Tente de novo mais tarde.' });
  });

  it('não envia duas vezes ao mesmo tempo', async () => {
    const hook = setup();
    hook.current().setEmail('maria@gmail.com');
    const first = hook.current().submit();
    await hook.current().submit();
    await first;

    expect(api.requestPasswordReset).toHaveBeenCalledTimes(1);
  });
});
