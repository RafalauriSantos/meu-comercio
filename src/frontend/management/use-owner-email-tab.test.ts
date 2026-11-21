import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const api = vi.hoisted(() => ({
  getOwnerEmail: vi.fn(),
  requestEmailVerification: vi.fn(),
  changeOwnerEmail: vi.fn(),
}));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<object>()), apiClient: api }));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useOwnerEmailTab } from './use-owner-email-tab';

const setProcessing = vi.fn();
const setLoadFailed = vi.fn();
const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

async function mount(status: { email: string | null; verified: boolean }) {
  api.getOwnerEmail.mockResolvedValue(status);
  const hook = mountHook(() => useOwnerEmailTab({ setProcessing, setLoadFailed }));
  await hook.current().loadOwnerEmail();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('useOwnerEmailTab: leitura', () => {
  it('AC-62: guarda o estado lido e marca a leitura como boa', async () => {
    const hook = await mount({ email: null, verified: false });

    expect(hook.current().status).toEqual({ email: null, verified: false });
    const update = setLoadFailed.mock.calls[0][0] as (f: object) => object;
    expect(update({})).toEqual({ ownerEmail: false });
  });

  it('a falha da leitura marca loadFailed.ownerEmail, deixa o estado desconhecido e não lança', async () => {
    api.getOwnerEmail.mockRejectedValue(new ApiError(500, 'x'));
    const hook = mountHook(() => useOwnerEmailTab({ setProcessing, setLoadFailed }));

    await expect(hook.current().loadOwnerEmail()).resolves.toBeUndefined();

    expect(hook.current().status).toBeNull();
    expect((setLoadFailed.mock.calls[0][0] as (f: object) => object)({})).toEqual({ ownerEmail: true });
  });
});

describe('useOwnerEmailTab: cadastrar e trocar', () => {
  it('AC-1: sem e-mail na conta, cadastra com e-mail e senha atual e mostra o envio; começa a espera de 60 s', async () => {
    const hook = await mount({ email: null, verified: false });
    api.requestEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });
    hook.current().setEmail('maria@gmail.com');
    hook.current().setCurrentPassword('senha-atual-1');

    await hook.current().handleSubmit(submitEvent);

    expect(api.requestEmailVerification).toHaveBeenCalledWith({ email: 'maria@gmail.com', currentPassword: 'senha-atual-1' });
    expect(api.changeOwnerEmail).not.toHaveBeenCalled();
    const tab = hook.current();
    expect(tab.sentTo).toBe('maria@gmail.com');
    expect(tab.error).toBeNull();
    expect(tab.status).toEqual({ email: 'maria@gmail.com', verified: false });
    expect(tab.email).toBe('');
    expect(tab.currentPassword).toBe('');
    expect(tab.seconds).toBe(60);
    expect(setProcessing.mock.calls).toEqual([[true], [false]]);
    hook.unmount();
  });

  it('AC-6: com e-mail na conta, trocar manda os DOIS campos por changeOwnerEmail e o novo nasce não confirmado', async () => {
    const hook = await mount({ email: 'velho@gmail.com', verified: true });
    api.changeOwnerEmail.mockResolvedValue({ email: 'novo@gmail.com' });
    hook.current().setEmail('novo@gmail.com');
    hook.current().setCurrentPassword('senha-atual-1');

    await hook.current().handleSubmit(submitEvent);

    expect(api.changeOwnerEmail).toHaveBeenCalledWith({ email: 'novo@gmail.com', currentPassword: 'senha-atual-1' });
    expect(api.requestEmailVerification).not.toHaveBeenCalled();
    expect(hook.current().status).toEqual({ email: 'novo@gmail.com', verified: false });
    hook.unmount();
  });

  it.each([
    ['AC-6: senha atual errada (403)', new ApiError(403, 'Senha atual incorreta.'), 'Senha atual incorreta.'],
    ['AC-2: e-mail inválido (400)', new ApiError(400, 'E-mail inválido'), 'E-mail inválido'],
    ['AC-5: e-mail em uso (409)', new ApiError(409, 'Este e-mail já está em uso'), 'Este e-mail já está em uso'],
    ['AC-48: falha de envio (503)', new ApiError(503, 'Não conseguimos enviar agora. Tente de novo em alguns minutos.'), 'Não conseguimos enviar agora. Tente de novo em alguns minutos.'],
    ['AC-10: limite (429)', new ApiError(429, 'Aguarde 40 segundos para tentar de novo.'), 'Aguarde 40 segundos para tentar de novo.'],
  ])('%s: mostra a mensagem do servidor, não grava estado novo e libera o botão', async (_name, error, message) => {
    const hook = await mount({ email: null, verified: false });
    api.requestEmailVerification.mockRejectedValue(error);
    hook.current().setEmail('maria@gmail.com');
    hook.current().setCurrentPassword('x');

    await hook.current().handleSubmit(submitEvent);

    const tab = hook.current();
    expect(tab.error).toBe(message);
    expect(tab.sentTo).toBeNull();
    expect(tab.status).toEqual({ email: null, verified: false });
    expect(tab.email).toBe('maria@gmail.com'); // what was typed stays for another try
    expect(tab.seconds).toBe(0);
    expect(setProcessing).toHaveBeenLastCalledWith(false);
  });
});

describe('useOwnerEmailTab: reenviar', () => {
  it('AC-10: reenviar ao e-mail já gravado não manda e-mail nem senha, e começa a espera', async () => {
    const hook = await mount({ email: 'maria@gmail.com', verified: false });
    api.requestEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });

    await hook.current().handleResend();

    expect(api.requestEmailVerification).toHaveBeenCalledWith();
    expect(hook.current().sentTo).toBe('maria@gmail.com');
    expect(hook.current().seconds).toBe(60);
    hook.unmount();
  });

  it('AC-10/66: durante a espera, outro pedido não chama a API; passados 60 s ele volta a valer', async () => {
    const hook = await mount({ email: 'maria@gmail.com', verified: false });
    api.requestEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });
    await hook.current().handleResend();

    await hook.current().handleResend();
    expect(api.requestEmailVerification).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(hook.current().seconds).toBe(30);
    vi.advanceTimersByTime(30_000);
    expect(hook.current().seconds).toBe(0);
    await hook.current().handleResend();
    expect(api.requestEmailVerification).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('429 do reenvio mostra a mensagem do servidor', async () => {
    const hook = await mount({ email: 'maria@gmail.com', verified: false });
    api.requestEmailVerification.mockRejectedValue(new ApiError(429, 'Aguarde 40 segundos para tentar de novo.'));

    await hook.current().handleResend();

    expect(hook.current().error).toBe('Aguarde 40 segundos para tentar de novo.');
    expect(hook.current().seconds).toBe(0);
  });
});
