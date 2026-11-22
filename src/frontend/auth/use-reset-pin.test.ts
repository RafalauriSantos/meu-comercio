import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const { fakeHooks } = await import('@/test-utils/hook-harness');
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
});

const api = vi.hoisted(() => ({
  inspectPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  inspectPinReset: vi.fn(),
  confirmPinReset: vi.fn(),
}));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: api,
}));

import { mountHook } from '@/test-utils/hook-harness';
import { ApiError } from '@/frontend/lib/api-client';
import { useResetPassword } from './use-reset-password';

const TOKEN = 'token-do-link-0123456789abcdefghijklmnop';
const PASSWORD = 'senha-nova-1';
const PIN = '123456';
const replaceState = vi.fn();
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function open(hash = `#token=${TOKEN}`) {
  vi.stubGlobal('window', {
    location: { hash, pathname: '/redefinir-pin' },
    history: { replaceState },
  });
  const hook = mountHook(() => useResetPassword('pin'), { strict: true });
  await settle();
  return hook;
}

type Values = {
  password?: string;
  confirm?: string;
  pin?: string;
  confirmPin?: string;
};

function fill(hook: Awaited<ReturnType<typeof open>>, values: Values = {}) {
  const { password = PASSWORD, confirm = password, pin = PIN, confirmPin = pin } = values;
  hook.current().setPassword(password);
  hook.current().setConfirm(confirm);
  hook.current().setPin(pin);
  hook.current().setConfirmPin(confirmPin);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.inspectPinReset.mockResolvedValue({ ok: true });
  api.confirmPinReset.mockResolvedValue({ ok: true });
});

describe('useResetPassword("pin")', () => {
  it('AC-28: ao abrir consulta o link UMA vez (Strict Mode), pelo PIN, e NÃO redefine', async () => {
    const hook = await open();

    expect(api.inspectPinReset).toHaveBeenCalledTimes(1);
    expect(api.inspectPinReset).toHaveBeenCalledWith(TOKEN);
    expect(api.inspectPasswordReset).not.toHaveBeenCalled();
    expect(api.confirmPinReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'ready' });
  });

  it('AC-36: apaga o fragmento da URL', async () => {
    await open();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/redefinir-pin');
  });

  it('AC-29: só o envio redefine, com senha e PIN juntos; depois mostra o sucesso', async () => {
    const hook = await open();
    fill(hook);

    const submitting = hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'submitting' });
    await submitting;

    expect(api.confirmPinReset).toHaveBeenCalledTimes(1);
    expect(api.confirmPinReset).toHaveBeenCalledWith(TOKEN, PASSWORD, PASSWORD, PIN, PIN);
    expect(api.confirmPasswordReset).not.toHaveBeenCalled();
    expect(hook.current().phase).toEqual({ name: 'done' });
  });

  it('AC-30: o PIN só guarda dígitos, até 6 (letras e excesso nunca chegam ao estado)', async () => {
    const hook = await open();
    hook.current().setPin('12a3-4567890');
    expect(hook.current().pin).toBe('123456');
  });

  it('AC-30: PINs diferentes, senhas diferentes e PIN de 5 dígitos não chamam o servidor', async () => {
    const cases: [Values, string][] = [
      [{ confirmPin: '654321' }, 'Os PINs não conferem.'],
      [{ confirm: 'outra-senha-2' }, 'As senhas não conferem.'],
      [{ pin: '12345', confirmPin: '12345' }, 'O PIN deve ter 6 números.'],
    ];
    for (const [values, error] of cases) {
      const hook = await open();
      fill(hook, values);
      await hook.current().submit();
      expect(hook.current().phase).toEqual({ name: 'ready', error });
    }
    expect(api.confirmPinReset).not.toHaveBeenCalled();
  });

  it('AC-30: erro de campo do servidor (INVALID_PASSWORD) mantém o link vivo e dá para tentar de novo', async () => {
    api.confirmPinReset.mockRejectedValueOnce(
      new ApiError(400, 'O PIN deve ter 6 números.', undefined, 'INVALID_PASSWORD')
    );
    const hook = await open();
    fill(hook);

    await hook.current().submit();
    expect(hook.current().phase).toEqual({
      name: 'ready',
      error: 'O PIN deve ter 6 números.',
    });

    await hook.current().submit();
    expect(api.confirmPinReset).toHaveBeenLastCalledWith(TOKEN, PASSWORD, PASSWORD, PIN, PIN);
    expect(hook.current().phase).toEqual({ name: 'done' });
  });

  it('AC-35/41: outro 400 é link inválido; 429 é limite, na consulta e no envio', async () => {
    api.confirmPinReset.mockRejectedValueOnce(new ApiError(400, 'Dados inválidos.'));
    const hook = await open();
    fill(hook);
    await hook.current().submit();
    expect(hook.current().phase).toEqual({ name: 'invalid' });

    api.inspectPinReset.mockRejectedValueOnce(new ApiError(429, 'Aguarde 50 minutos para tentar de novo.'));
    expect((await open()).current().phase).toEqual({
      name: 'limited',
      message: 'Aguarde 50 minutos para tentar de novo.',
    });

    const other = await open();
    fill(other);
    api.confirmPinReset.mockRejectedValueOnce(new ApiError(429, 'Aguarde 10 minutos para tentar de novo.'));
    await other.current().submit();
    expect(other.current().phase).toEqual({
      name: 'limited',
      message: 'Aguarde 10 minutos para tentar de novo.',
    });
  });

  it('sem token: inválido, sem consultar', async () => {
    expect((await open('')).current().phase).toEqual({ name: 'invalid' });
    expect(api.inspectPinReset).not.toHaveBeenCalled();
  });

  it('nem token, nem PIN, nem senha vão para console', async () => {
    const spies = (['log', 'error', 'warn'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    api.inspectPinReset.mockRejectedValueOnce(new Error(`boom ${TOKEN}`));
    const hook = await open();
    await hook.current().retry();
    fill(hook);
    api.confirmPinReset.mockRejectedValueOnce(new Error(`boom ${PIN} ${PASSWORD}`));
    await hook.current().submit();
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of [TOKEN, PIN, PASSWORD]) expect(logged).not.toContain(secret);
  });
});
