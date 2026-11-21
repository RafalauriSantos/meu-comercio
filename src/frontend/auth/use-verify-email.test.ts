import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const api = vi.hoisted(() => ({ inspectEmailVerification: vi.fn(), confirmEmailVerification: vi.fn() }));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<object>()), apiClient: api }));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useVerifyEmail } from './use-verify-email';

const TOKEN = 'token-do-link-0123456789abcdefghijklmnop';
const replaceState = vi.fn();
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Strict Mode runs the effect twice in development; the first run clears the fragment, so the second finds none.
async function open(hash = `#token=${TOKEN}`) {
  vi.stubGlobal('window', { location: { hash, pathname: '/verificar-email' }, history: { replaceState } });
  const hook = mountHook(() => useVerifyEmail(), { strict: true });
  await settle();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.inspectEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });
  api.confirmEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });
});

describe('useVerifyEmail', () => {
  it('AC-3: ao abrir, consulta o link UMA vez (mesmo em Strict Mode) e NÃO confirma', async () => {
    const hook = await open();

    expect(api.inspectEmailVerification).toHaveBeenCalledTimes(1);
    expect(api.inspectEmailVerification).toHaveBeenCalledWith(TOKEN);
    expect(api.confirmEmailVerification).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'ready', email: 'maria@gmail.com' });
  });

  it('AC-36: apaga o fragmento da URL, sem pôr o token em query nem em outro lugar', async () => {
    await open();

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/verificar-email');
  });

  it('AC-4: só o clique confirma, com o token guardado; depois mostra o e-mail confirmado', async () => {
    const hook = await open();

    const confirming = hook.current().confirm();
    expect(hook.current().phase).toEqual({ name: 'confirming', email: 'maria@gmail.com' });
    await confirming;

    expect(api.confirmEmailVerification).toHaveBeenCalledTimes(1);
    expect(api.confirmEmailVerification).toHaveBeenCalledWith(TOKEN);
    expect(hook.current().phase).toEqual({ name: 'done', email: 'maria@gmail.com' });
  });

  it('AC-5: 409 no confirm vira "em uso"', async () => {
    const hook = await open();
    api.confirmEmailVerification.mockRejectedValue(new ApiError(409, 'Este e-mail já está em uso'));

    await hook.current().confirm();

    expect(hook.current().phase).toEqual({ name: 'in-use' });
  });

  it('AC-22/35: sem token no fragmento é link inválido e nada é consultado', async () => {
    const hook = await open('');

    expect(hook.current().phase).toEqual({ name: 'invalid' });
    expect(api.inspectEmailVerification).not.toHaveBeenCalled();
  });

  it('AC-22/35: 400 na consulta é link inválido', async () => {
    api.inspectEmailVerification.mockRejectedValue(new ApiError(400, 'Link inválido ou vencido. Peça um novo.'));
    const hook = await open();

    expect(hook.current().phase).toEqual({ name: 'invalid' });
  });

  it('AC-41: 429 na consulta e no confirm é limite, com a mensagem do servidor', async () => {
    api.inspectEmailVerification.mockRejectedValue(new ApiError(429, 'Aguarde 50 minutos para tentar de novo.'));
    const first = await open();
    expect(first.current().phase).toEqual({ name: 'limited', message: 'Aguarde 50 minutos para tentar de novo.' });

    api.inspectEmailVerification.mockResolvedValue({ email: 'maria@gmail.com' });
    const second = await open();
    api.confirmEmailVerification.mockRejectedValue(new ApiError(429, 'Aguarde 10 minutos para tentar de novo.'));
    await second.current().confirm();
    expect(second.current().phase).toEqual({ name: 'limited', message: 'Aguarde 10 minutos para tentar de novo.' });
  });

  it('sem rede na consulta: fase "failed" e "Tentar de novo" repete a consulta com o mesmo token', async () => {
    const offline = new ApiError(0, 'Sem conexão com a internet. Confira a conexão e tente de novo.', undefined, undefined, 'network');
    api.inspectEmailVerification.mockRejectedValueOnce(offline);
    const hook = await open();
    expect(hook.current().phase).toEqual({ name: 'failed', message: offline.message });

    await hook.current().retry();

    expect(api.inspectEmailVerification).toHaveBeenCalledTimes(2);
    expect(api.inspectEmailVerification).toHaveBeenLastCalledWith(TOKEN);
    expect(hook.current().phase).toEqual({ name: 'ready', email: 'maria@gmail.com' });
  });

  it('sem rede no confirm: volta a "ready" com o aviso e o botão tenta de novo (não vira inválido)', async () => {
    const hook = await open();
    const offline = new ApiError(0, 'Sem conexão com a internet. Confira a conexão e tente de novo.', undefined, undefined, 'network');
    api.confirmEmailVerification.mockRejectedValueOnce(offline);

    await hook.current().confirm();
    expect(hook.current().phase).toEqual({ name: 'ready', email: 'maria@gmail.com', error: offline.message });

    await hook.current().confirm();
    expect(hook.current().phase).toEqual({ name: 'done', email: 'maria@gmail.com' });
  });

  it('o token não vai para console nem para storage', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.inspectEmailVerification.mockRejectedValue(new Error(`boom ${TOKEN}`));
    await open();
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});
