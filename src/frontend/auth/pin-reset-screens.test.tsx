import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForgotPasswordScreen } from './forgot-password-screen';
import { ResetPasswordScreen } from './reset-password-screen';
import { FORGOT_COPY, FORGOT_NEUTRAL_MESSAGE } from './forgot-password-view';
import type { ForgotPhase } from './use-forgot-password';
import type { ResetPhase } from './use-reset-password';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

function renderForgot(phase: ForgotPhase) {
  return renderToStaticMarkup(
    <ForgotPasswordScreen
      copy={FORGOT_COPY.pin}
      phase={phase}
      email="maria@gmail.com"
      honeypot=""
      seconds={0}
      onEmailChange={vi.fn()}
      onHoneypotChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

function renderReset(phase: ResetPhase, confirmPin = '', withPin = true) {
  return renderToStaticMarkup(
    <ResetPasswordScreen
      phase={phase}
      password="senha-nova-1"
      confirm=""
      onPasswordChange={vi.fn()}
      onConfirmChange={vi.fn()}
      onSubmit={vi.fn()}
      onRetry={vi.fn()}
      pinFields={
        withPin
          ? {
              pin: '123456',
              confirmPin,
              onPinChange: vi.fn(),
              onConfirmPinChange: vi.fn(),
            }
          : undefined
      }
    />
  );
}

describe('ForgotPasswordScreen com a copy do PIN', () => {
  it('AC-26/65/57: título do PIN, só campo de e-mail (sem PIN nem senha), ajuda e nota da operadora', () => {
    const markup = renderForgot({ name: 'form' });

    expect(markup).toMatch(/<h1[^>]*>Esqueci o PIN<\/h1>/);
    expect(markup).toMatch(/<label[^>]*for="forgot-email"[^>]*>E-mail<\/label>/);
    expect(markup).toContain('id="forgot-website"');
    expect(markup).not.toContain('type="password"');
    expect(markup).not.toContain('inputMode');
    expect(markup).toContain('só funciona com e-mail confirmado antes');
    expect(markup).toContain('Operadora: peça à proprietária para ajudar.');
    expect(markup).toMatch(/<a[^>]*href="\/login"[^>]*>Voltar ao login<\/a>/);
  });

  it('AC-27: o "enviado" é a mesma M1 fixa, igual ao da senha', () => {
    const markup = renderForgot({ name: 'sent' });
    expect(markup).toContain(FORGOT_NEUTRAL_MESSAGE);
    expect(markup).toContain('cada pedido novo cancela o anterior.');
  });
});

describe('ResetPasswordScreen com pinFields', () => {
  it('AC-28: mostra os 4 campos na ordem senha, repita a senha, novo PIN, repita o PIN', () => {
    const markup = renderReset({ name: 'ready' });
    const order = ['for="reset-password"', 'for="reset-confirm"', 'for="reset-pin"', 'for="reset-confirm-pin"'].map(
      (s) => markup.indexOf(s)
    );

    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup).toMatch(/<label[^>]*for="reset-pin"[^>]*>Novo PIN \(6 números\)<\/label>/);
    expect(markup).toMatch(/<label[^>]*for="reset-confirm-pin"[^>]*>Repita o PIN<\/label>/);
    expect(markup).toMatch(/<h1[^>]*>Redefinir PIN<\/h1>/);
    expect(markup).toContain('desconectada de todos os aparelhos');
    expect(markup.match(/inputMode="numeric"/g)).toHaveLength(2);
    expect(markup.match(/autoComplete="off"/g)).toHaveLength(2);
  });

  it('avisa já na tela que a repetição do PIN difere', () => {
    expect(renderReset({ name: 'ready' }, '123457')).toContain('Os PINs não conferem.');
    expect(renderReset({ name: 'ready' }, '12')).not.toContain('Os PINs não conferem.');
  });

  it('AC-29: sucesso com o texto exato, botão para /login sem query e aviso das sessões', () => {
    const markup = renderReset({ name: 'done' });

    expect(markup).toContain('PIN e senha alterados. Entre com a nova senha.');
    expect(markup).toContain('desconectada de todos os aparelhos');
    expect(markup).toMatch(/<a[^>]*href="\/login"[^>]*>Ir para o login<\/a>/);
    expect(markup).not.toContain('type="password"');
  });

  it('AC-35: link recusado leva a /esqueci-pin; limite e falha não viram link inválido', () => {
    const invalid = renderReset({ name: 'invalid' });
    expect(invalid).toContain('Link inválido ou vencido. Peça um novo.');
    expect(invalid).toMatch(/<a[^>]*href="\/esqueci-pin"[^>]*>/);

    const limited = renderReset({
      name: 'limited',
      message: 'Aguarde 50 minutos para tentar de novo.',
    });
    expect(limited).toContain('Aguarde 50 minutos');
    expect(limited).not.toContain('Link inválido');
  });

  it('sem pinFields a tela de senha continua igual (2 campos, textos de senha, /esqueci-senha)', () => {
    const markup = renderReset({ name: 'ready' }, '', false);
    expect(markup).not.toContain('reset-pin');
    expect(markup).toMatch(/<h1[^>]*>Redefinir senha<\/h1>/);
    expect(renderReset({ name: 'done' }, '', false)).toContain('Senha alterada. Entre com a nova senha.');
    expect(renderReset({ name: 'invalid' }, '', false)).toMatch(/href="\/esqueci-senha"/);
  });
});

describe('páginas /esqueci-pin e /redefinir-pin (código)', () => {
  const files = {
    forgotPage: read('src', 'app', 'esqueci-pin', 'page.tsx'),
    forgotLayout: read('src', 'app', 'esqueci-pin', 'layout.tsx'),
    resetPage: read('src', 'app', 'redefinir-pin', 'page.tsx'),
    resetLayout: read('src', 'app', 'redefinir-pin', 'layout.tsx'),
    forgotHook: read('src', 'frontend', 'auth', 'use-forgot-password.ts'),
    resetHook: read('src', 'frontend', 'auth', 'use-reset-password.ts'),
    forgotScreen: read('src', 'frontend', 'auth', 'forgot-password-screen.tsx'),
    resetScreen: read('src', 'frontend', 'auth', 'reset-password-screen.tsx'),
    view: read('src', 'frontend', 'auth', 'forgot-password-view.ts'),
  };

  it('AC-26: páginas finas, noindex; /redefinir-pin também sem Referer', () => {
    expect(files.forgotPage).toContain("useForgotPassword('pin')");
    expect(files.forgotPage).toContain('FORGOT_COPY.pin');
    expect(files.forgotPage.split('\n').length).toBeLessThan(30);
    expect(files.forgotLayout).toContain('index: false');
    expect(files.resetPage).toContain("useResetPassword('pin')");
    expect(files.resetPage).toContain('pinFields=');
    expect(files.resetPage.split('\n').length).toBeLessThan(40);
    expect(files.resetLayout).toContain('index: false');
    expect(files.resetLayout).toContain("referrer: 'no-referrer'");
  });

  it('AC-36: nada de console, storage ou query nos arquivos do PIN; o fragmento é apagado', () => {
    expect(files.resetHook).toContain('history.replaceState(null');
    for (const [name, text] of Object.entries(files)) {
      for (const forbidden of ['console.', 'localStorage', 'sessionStorage', 'location.search', 'useSearchParams']) {
        expect(text, `${name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('AC-28: o confirm do PIN só é ligado ao envio do formulário, nunca a um efeito', () => {
    expect(files.resetHook.split('confirmPinReset(').length - 1).toBe(1);
    const effect = files.resetHook.slice(
      files.resetHook.indexOf('useEffect('),
      files.resetHook.indexOf('}, [inspect]);')
    );
    expect(effect.length).toBeGreaterThan(50);
    expect(effect).not.toContain('submit');
    expect(effect).not.toContain('confirm');
    expect(files.resetScreen).toContain('<form onSubmit={handleSubmit}');
  });

  it('AC-28: a página de PIN não tem caminho que troque só o PIN (sempre confirmPinReset com a senha)', () => {
    expect(files.resetHook).toMatch(/confirmPinReset\(token\.current, password, confirm, pin, confirmPin\)/);
  });
});
