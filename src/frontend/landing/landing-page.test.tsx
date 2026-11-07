import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from './landing-page';

const FORBIDDEN = ['lucro', 'relatório', 'depoimento', 'http://', 'https://'];

function render(): string {
  return renderToStaticMarkup(<LandingPage />);
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

function linkTexts(markup: string, href: string): string[] {
  const pattern = new RegExp(`<a[^>]*href="${href.replace(/[?]/g, '\\?')}"[^>]*>([\\s\\S]*?)</a>`, 'g');
  return Array.from(markup.matchAll(pattern)).map((match) => match[1].replace(/<[^>]+>/g, '').trim());
}

describe('LandingPage: header and hero', () => {
  it('has exactly one h1 with the promise', () => {
    const markup = render();

    expect(count(markup, '<h1')).toBe(1);
    expect(markup).toMatch(/<h1[^>]*>Cada real que entra e sai, sob seu controle\.<\/h1>/);
  });

  it('sends the primary action to the register tab and the others to the login', () => {
    const markup = render();

    expect(linkTexts(markup, '/login?modo=cadastro')).toContain('Criar minha conta grátis');
    expect(linkTexts(markup, '/login')).toEqual(expect.arrayContaining(['Já tenho conta', 'Entrar']));
  });

  it('shows three example figures and labels them as an example', () => {
    const markup = render();

    expect(count(markup, '<dt')).toBe(3);
    expect(markup).toContain('Exemplo');
    expect(markup).toContain('Fiado em aberto');
    expect(markup).toContain('Dinheiro esperado no caixa');
    expect(markup).toContain('Conferência do caixa');
  });

  it('says the system is free for now and states no price', () => {
    const markup = render();

    expect(markup).toContain('Gratuito por enquanto');
    expect(markup).not.toMatch(/R\$\s?\d+[,.]\d{2}\s*\/\s*mês/i);
  });

  it('contains none of the forbidden words or external links', () => {
    const markup = render().toLowerCase();

    for (const word of FORBIDDEN) {
      expect(markup).not.toContain(word);
    }
  });
});
