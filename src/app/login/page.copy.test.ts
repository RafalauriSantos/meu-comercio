import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'app', 'login', 'page.tsx'), 'utf8');

describe('login page composition', () => {
  it('is built from the shared auth pieces', () => {
    for (const piece of ['AuthShell', 'PasswordField', 'PinField', 'FormError']) {
      expect(source).toContain(`<${piece}`);
    }
  });

  it('no longer uses the pill or the icon badge above the headings', () => {
    expect(source).not.toContain('auth-pill');
    expect(source).not.toContain('auth-icon-badge');
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

  it('uses the same words as the landing and a clear title for each state', () => {
    for (const text of ['Criar conta', 'Crie sua conta', 'Configure sua loja', 'Abrir o caixa', 'Entrar']) {
      expect(source).toContain(text);
    }
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
