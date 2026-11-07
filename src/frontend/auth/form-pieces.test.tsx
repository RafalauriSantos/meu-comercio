import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordField } from './password-field';
import { PinField } from './pin-field';
import { FormError } from './form-error';

const noop = () => {};

describe('PasswordField', () => {
  it('is a password input with the right autocomplete and a keyboard-reachable show button', () => {
    const markup = renderToStaticMarkup(
      <PasswordField id="pw" label="Senha" value="" onChange={noop} autoComplete="current-password" />
    );

    expect(markup).toContain('type="password"');
    expect(markup).toMatch(/autocomplete="current-password"/i);
    expect(markup).toMatch(/<label[^>]*for="pw"[^>]*>Senha<\/label>/);
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*aria-label="Mostrar senha"/);
    expect(markup).not.toContain('aria-pressed');
  });

  it('marks the input invalid and describes it when told so', () => {
    const markup = renderToStaticMarkup(
      <PasswordField id="pw" label="Senha" value="x" onChange={noop} autoComplete="new-password" invalid describedBy="pw-msg" />
    );

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="pw-msg"');
  });
});

describe('PinField', () => {
  it('asks for exactly six digits with a numeric keypad and no autofill', () => {
    const markup = renderToStaticMarkup(
      <PinField id="pin" label="PIN da dona (6 dígitos)" hint="Libera o que é arriscado." value="" onChange={noop} />
    );

    expect(markup).toMatch(/inputmode="numeric"/i);
    // No maxlength: the browser would cut a pasted "12a4-5678" before sanitizePin cleans it.
    expect(markup).not.toMatch(/maxlength/i);
    expect(markup).toContain('pattern="[0-9]{6}"');
    expect(markup).toMatch(/autocomplete="off"/i);
    expect(markup).toContain('PIN da dona (6 dígitos)');
    expect(markup).toMatch(/aria-describedby="pin-hint"/);
    expect(markup).toMatch(/<p[^>]*id="pin-hint"[^>]*>Libera o que é arriscado\.<\/p>/);
  });
});

describe('FormError', () => {
  it('is announced to screen readers', () => {
    const markup = renderToStaticMarkup(<FormError message="Usuário ou senha inválidos." />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Usuário ou senha inválidos.');
  });
});
