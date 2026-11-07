import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell } from './auth-shell';

const FORBIDDEN = ['lucro', 'relatório', 'depoimento', 'http://', 'https://'];

function render(): string {
  return renderToStaticMarkup(
    <AuthShell>
      <h1>Título do formulário</h1>
    </AuthShell>
  );
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('AuthShell', () => {
  it('keeps the wordmark link, the form and one h1', () => {
    const markup = render();

    expect(markup).toMatch(/<a[^>]*href="\/"[^>]*>Meu Comércio<\/a>/);
    expect(markup).toContain('<h1>Título do formulário</h1>');
    expect(count(markup, '<h1')).toBe(1);
  });

  it('shows the product image as a decorative example', () => {
    const markup = render();
    const image = markup.match(/<img[^>]*>/)?.[0] ?? '';

    expect(image).toContain('src="/landing/pdv-desktop.webp"');
    expect(image).toContain('width="1920"');
    expect(image).toContain('height="1140"');
    expect(image).toContain('alt=""');
    expect(markup).toContain('Exemplo');
  });

  it('makes no forbidden claim', () => {
    const markup = render().toLowerCase();

    for (const word of FORBIDDEN) {
      expect(markup).not.toContain(word);
    }
  });

  it('states the three allowed claims, including the 6 digit owner PIN', () => {
    const markup = render();

    expect(count(markup, '<li>')).toBe(3);
    expect(markup).toContain('6 dígitos');
    expect(markup).toContain('valor esperado');
  });
});
