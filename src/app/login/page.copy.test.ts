import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'app', 'login', 'page.tsx'), 'utf8');

describe('login page composition', () => {
  it('is built from the shared auth pieces', () => {
    for (const piece of ['AuthShell', 'CashOpenScreen', 'PasswordField', 'PinField', 'FormError']) {
      expect(source).toContain(`<${piece}`);
    }
  });

  it('has no brand panel, tabs or landing display font any more', () => {
    expect(source).not.toContain('auth-tab');
    expect(source).not.toContain('displayFont');
    expect(source).not.toContain('landing/fonts');
  });

  it('switches between the forms with a footer toggle, hidden on first access', () => {
    expect(source).toContain('Ainda não tem conta?');
    expect(source).toContain('Criar conta grátis');
    expect(source).toContain('Já tem conta?');
    expect(source).toMatch(/setupRequired \? undefined/);
  });

  it('lets a password manager fill and save every field', () => {
    for (const attribute of [
      'autoComplete="username"',
      'autoComplete="current-password"',
      'autoComplete="new-password"',
      'autoComplete="organization"',
    ]) {
      expect(source).toContain(attribute);
    }
  });

  it('describes the PIN as the product works, not as it did not', () => {
    expect(source).not.toMatch(/fechamento de caixa/i);
    expect(source).toContain('fiado acima do limite e estornos');
  });

  it('has a clear title for each state', () => {
    for (const text of ['Entrar', 'Crie sua conta', 'Configure sua loja']) {
      expect(source).toContain(text);
    }
  });

  it('does not add the design fields the app does not have', () => {
    for (const text of ['type="email"', 'Esqueci a senha', 'Continuar conectado', 'Celular', 'Tipo de comércio']) {
      expect(source).not.toContain(text);
    }
  });

  it('gives every keyed element of the screen its own key', () => {
    // The header and the form of one mode are siblings: sharing a key makes React warn and misplace them.
    const keys = [...source.matchAll(/\bkey="([^"]+)"/g)].map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tells, before submitting, that the repeated password differs', () => {
    expect(source).toContain('As senhas não conferem.');
    expect(source).toContain('setup-confirm-msg');
  });

  it('keeps the behavior: the same API calls and the 6 digit rule', () => {
    for (const call of ['getSetupStatus', 'registerMerchant', 'openCash', 'apiClient.login', 'getCurrentCash']) {
      expect(source).toContain(call);
    }
    expect(source).toContain('/^\\d{6}$/');
    expect(source).toContain('honeypot');
  });
});
