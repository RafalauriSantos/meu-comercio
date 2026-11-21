import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForgotPasswordScreen } from './forgot-password-screen';
import { FORGOT_NEUTRAL_MESSAGE } from './forgot-password-view';
import type { ForgotPhase } from './use-forgot-password';

function render(phase: ForgotPhase, seconds = 0) {
  return renderToStaticMarkup(
    <ForgotPasswordScreen
      phase={phase}
      email="maria@gmail.com"
      honeypot=""
      seconds={seconds}
      onEmailChange={vi.fn()}
      onHoneypotChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('ForgotPasswordScreen', () => {
  it('AC-11/65/57: formulário com e-mail, honeypot, ajuda de e-mail confirmado, operadora e volta ao login', () => {
    const markup = render({ name: 'form' });

    expect(markup.split('<h1').length - 1).toBe(1);
    expect(markup).toMatch(/<label[^>]*for="forgot-email"[^>]*>E-mail<\/label>/);
    expect(markup).toContain('type="email"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain('id="forgot-website"');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Enviar link<\/button>/);
    expect(markup).toContain('só funciona com e-mail confirmado antes');
    expect(markup).toContain('Operadora: peça à proprietária para ajudar.');
    expect(markup).toMatch(/<a[^>]*href="\/login"[^>]*>Voltar ao login<\/a>/);
    expect(markup).not.toContain(FORGOT_NEUTRAL_MESSAGE);
  });

  it('erro aparece como alerta e o formulário continua', () => {
    const markup = render({ name: 'form', error: 'Muitas tentativas. Tente de novo mais tarde.' });

    expect(markup).toMatch(/role="alert"[^>]*>[\s\S]*Muitas tentativas\. Tente de novo mais tarde\./);
    expect(markup).toContain('Enviar link</button>');
  });

  it('AC-13/66: enviado mostra a M1 exata, a ajuda de spam e "Pedir de novo" desativado durante a espera', () => {
    const markup = render({ name: 'sent' }, 42);

    expect(markup).toContain(FORGOT_NEUTRAL_MESSAGE);
    expect(FORGOT_NEUTRAL_MESSAGE).toBe(
      'Se este e-mail estiver cadastrado e confirmado, enviaremos um link em alguns minutos. Ele vale 30 minutos. Não chegou? Veja a caixa de spam.'
    );
    expect(markup).toContain('Não chegou em 2 minutos? Olhe Spam e Promoções. Procure o remetente Meu Comércio.');
    expect(markup).toContain('cada pedido novo cancela o anterior.');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Pedir de novo \(42 s\)<\/button>/);
    expect(markup).toMatch(/<a[^>]*href="\/login"[^>]*>Voltar ao login<\/a>/);
  });

  it('AC-66: terminada a espera, "Pedir de novo" fica ativo', () => {
    expect(render({ name: 'sent' }, 0)).toMatch(/<button(?![^>]*disabled)[^>]*>Pedir de novo<\/button>/);
  });
});

describe('página /esqueci-senha (código)', () => {
  it('AC-11: é fina e sem indexação', () => {
    const page = read('src', 'app', 'esqueci-senha', 'page.tsx');
    expect(page).toContain('useForgotPassword()');
    expect(page).toContain('<ForgotPasswordScreen');
    expect(page.split('\n').length).toBeLessThan(30);
    expect(read('src', 'app', 'esqueci-senha', 'layout.tsx')).toContain('index: false');
  });

  it('o e-mail digitado nunca vai a console, storage nem query', () => {
    for (const file of ['use-forgot-password.ts', 'forgot-password-screen.tsx', 'forgot-password-view.ts']) {
      const text = read('src', 'frontend', 'auth', file);
      for (const forbidden of ['console.', 'localStorage', 'sessionStorage', 'location.search']) {
        expect(text, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
