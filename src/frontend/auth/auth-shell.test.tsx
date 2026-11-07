import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell } from './auth-shell';

const FORBIDDEN = ['lucro', 'relatório', 'depoimento', 'http://', 'https://'];
const MODES = ['login', 'register', 'setup', 'cash'] as const;

function render(mode: (typeof MODES)[number]): string {
  return renderToStaticMarkup(
    <AuthShell mode={mode}>
      <h1>Título do formulário</h1>
    </AuthShell>
  );
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('AuthShell', () => {
  it.each(MODES)('keeps the wordmark link, the form and one h1 in mode %s', (mode) => {
    const markup = render(mode);

    expect(markup).toMatch(/<a[^>]*href="\/"[^>]*>Meu Comércio<\/a>/);
    expect(markup).toContain('<h1>Título do formulário</h1>');
    expect(count(markup, '<h1')).toBe(1);
  });

  it.each(MODES)('shows the product image as a decorative example in mode %s', (mode) => {
    const markup = render(mode);
    const image = markup.match(/<img[^>]*>/)?.[0] ?? '';

    expect(image).toContain('src="/landing/pdv-desktop.webp"');
    expect(image).toContain('width="1920"');
    expect(image).toContain('height="1140"');
    expect(image).toContain('alt=""');
    expect(markup).toContain('Exemplo');
  });

  it.each(MODES)('makes no forbidden claim in mode %s', (mode) => {
    const markup = render(mode).toLowerCase();

    for (const word of FORBIDDEN) {
      expect(markup).not.toContain(word);
    }
  });

  it('states the allowed claims on the login', () => {
    const markup = render('login');

    expect(count(markup, '<li>')).toBe(3);
    expect(markup).toContain('limite');
    expect(markup).toContain('valor esperado');
    expect(markup).toContain('venda simples em dinheiro');
  });

  it('states the 6 digit PIN claim on the sign up', () => {
    const markup = render('register');

    expect(count(markup, '<li>')).toBe(3);
    expect(markup).toContain('6 dígitos');
  });
});
