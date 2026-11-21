import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const api = vi.hoisted(() => ({ inspectPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<object>()), apiClient: api }));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useResetPassword } from './use-reset-password';

const TOKEN = 'token-do-link-0123456789abcdefghijklmnop';
const LINK_MESSAGE = 'Link inválido ou vencido. Peça um novo.';
const replaceState = vi.fn();
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Strict mode: the effect runs twice and the first run clears the fragment.
async function open(hash = `#token=${TOKEN}`) {
  vi.stubGlobal('window', { location: { hash, pathname: '/redefinir-senha' }, history: { replaceState } });
  const hook = mountHook(() => useResetPassword(), { strict: true });
  await settle();
  return hook;
}

function fill(hook: Awaited<ReturnType<typeof open>>, password = 'senha-nova-1', confirm = password) {
  hook.current().setPassword(password);
  hook.current().setConfirm(confirm);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.inspectPasswordReset.mockResolvedValue({ ok: true });
  api.confirmPasswordReset.mockResolvedValue({ ok: true });
});

describe('useResetPassword', () => {
  it('AC-18: ao abrir, consulta o link UMA vez (Strict Mode) e NÃO redefine', async () => {
    const hook = await open();

    expect(api.inspectPasswordReset).toHaveBeenCalledTimes(1);
    expect(api.inspectPasswordReset).toHaveBeenCalledWith(TOKEN);
    expect(api.confirmPasswordReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'ready' });
  });

  it('AC-36: apaga o fragmento da URL', async () => {
    await open();

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/redefinir-senha');
  });

  it('AC-19: só o envio redefine, com o token guardado; depois mostra o sucesso', async () => {
    const hook = await open();
    fill(hook);

    const submitting = hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'submitting' });
    await submitting;

    expect(api.confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(api.confirmPasswordReset).toHaveBeenCalledWith(TOKEN, 'senha-nova-1', 'senha-nova-1');
    expect(hook.current().phase).toEqual({ name: 'done' });
  });

  it('AC-20: senhas diferentes não chamam o servidor (nem gastam tentativa do link)', async () => {
    const hook = await open();
    fill(hook, 'senha-nova-1', 'outra-senha-2');

    await hook.current().submit();

    expect(api.confirmPasswordReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'ready', error: 'As senhas não conferem.' });
  });

  it('AC-20: erro de campo do servidor volta ao formulário, o link segue valendo e dá para tentar de novo', async () => {
    api.confirmPasswordReset.mockRejectedValueOnce(new ApiError(400, 'A senha deve ter no mínimo 8 caracteres.', undefined, 'INVALID_PASSWORD'));
    const hook = await open();
    fill(hook, 'curta', 'curta');

    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'ready', error: 'A senha deve ter no mínimo 8 caracteres.' });

    fill(hook);
    await hook.current().submit();
    expect(api.confirmPasswordReset).toHaveBeenLastCalledWith(TOKEN, 'senha-nova-1', 'senha-nova-1');
    expect(hook.current().phase).toEqual({ name: 'done' });
  });

  it('AC-22/35: sem token, 400 na consulta e 400 de link no envio são o mesmo "inválido"', async () => {
    expect((await open('')).current().phase).toEqual({ name: 'invalid' });
    expect(api.inspectPasswordReset).not.toHaveBeenCalled();

    api.inspectPasswordReset.mockRejectedValueOnce(new ApiError(400, LINK_MESSAGE));
    expect((await open()).current().phase).toEqual({ name: 'invalid' });

    const hook = await open();
    fill(hook);
    api.confirmPasswordReset.mockRejectedValue(new ApiError(400, LINK_MESSAGE));
    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'invalid' });
  });

  it('AC-20: 400 com code INVALID_PASSWORD é erro de campo e o link segue utilizável', async () => {
    api.confirmPasswordReset.mockRejectedValueOnce(new ApiError(400, 'Qualquer texto.', undefined, 'INVALID_PASSWORD'));
    const hook = await open();
    fill(hook);

    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'ready', error: 'Qualquer texto.' });

    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'done' });
  });

  it('400 sem o code (Dados inválidos.) e 409 no envio viram link inválido, com a mensagem única', async () => {
    for (const refused of [new ApiError(400, 'Dados inválidos.'), new ApiError(409, 'Conflito.')]) {
      const hook = await open();
      fill(hook);
      api.confirmPasswordReset.mockRejectedValueOnce(refused);
      await hook.current().submit();
      expect(hook.current().phase).toEqual({ name: 'invalid' });
    }
  });

  it('AC-41: 429 na consulta e no envio é limite, nunca link inválido', async () => {
    api.inspectPasswordReset.mockRejectedValueOnce(new ApiError(429, 'Aguarde 50 minutos para tentar de novo.'));
    expect((await open()).current().phase).toEqual({ name: 'limited', message: 'Aguarde 50 minutos para tentar de novo.' });

    const hook = await open();
    fill(hook);
    api.confirmPasswordReset.mockRejectedValue(new ApiError(429, 'Aguarde 10 minutos para tentar de novo.'));
    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'limited', message: 'Aguarde 10 minutos para tentar de novo.' });
  });

  it('sem rede na consulta: "failed" e "retry" consulta de novo com o mesmo token', async () => {
    const offline = new ApiError(0, 'Sem conexão com a internet.', undefined, undefined, 'network');
    api.inspectPasswordReset.mockRejectedValueOnce(offline);
    const hook = await open();
    expect(hook.current().phase).toEqual({ name: 'failed', message: offline.message });

    await hook.current().retry();

    expect(api.inspectPasswordReset).toHaveBeenCalledTimes(2);
    expect(api.inspectPasswordReset).toHaveBeenLastCalledWith(TOKEN);
    expect(hook.current().phase).toEqual({ name: 'ready' });
  });

  it('sem rede no envio: volta ao formulário com o aviso, não vira inválido', async () => {
    const offline = new ApiError(0, 'Sem conexão com a internet.', undefined, undefined, 'network');
    api.confirmPasswordReset.mockRejectedValueOnce(offline);
    const hook = await open();
    fill(hook);

    await hook.current().submit();

    expect(hook.current().phase).toEqual({ name: 'ready', error: offline.message });
  });

  it('o token não vai para console', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.inspectPasswordReset.mockRejectedValue(new Error(`boom ${TOKEN}`));
    await open();
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});
