import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('shows a labelled example panel instead of a screenshot', () => {
    const markup = render();

    expect(markup).not.toContain('<img');
    expect(markup).toMatch(/<aside[^>]*aria-label="Exemplo de painel do caixa"/);
    expect(markup).toContain('Caixa de hoje');
    expect(markup).toContain('Fiado em aberto');
    expect(markup).toContain('Dinheiro esperado no caixa');
    expect(markup).toContain('Conferência do caixa');
    expect(markup).toContain('<span class="landing-badge">Exemplo</span>');
    expect(markup).toContain('Valores de exemplo, não são dados reais.');
  });

  it('always opens in the light theme, as designed, whatever the system theme is', () => {
    const markup = render();
    const globals = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

    expect(markup).toMatch(/<div class="landing" data-theme="light">/);
    expect(markup).not.toContain('data-theme="dark"');
    // The light tokens must apply to any element that opts in, so a dark system theme does not
    // reach the landing: they sit on <html> and on [data-theme='light'].
    expect(globals).toMatch(/^:root,\n\[data-theme='light'\] \{/m);
    // The dark tokens apply to any element that opts in, too.
    expect(globals).toMatch(/^\[data-theme='dark'\] \{/m);
  });

  it('uses the brand mark and the wordmark in the nav', () => {
    const markup = render();

    expect(markup).toMatch(/<nav[^>]*>[\s\S]*<svg[\s\S]*Meu Comércio[\s\S]*Entrar/);
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

describe('LandingPage: the rest of the page', () => {
  it('pairs each of the four losses with the control that stops it', () => {
    const markup = render();

    for (const [loss, control] of [
      ['Fiado esquecido', 'extrato'],
      ['Caixa que não bate', 'diferença'],
      ['Troco errado', 'troco'],
      ['Estoque que some', 'baixa o estoque'],
    ]) {
      expect(markup).toContain(loss);
      expect(markup.toLowerCase()).toContain(control);
    }
  });

  it('explains how it works in three ordered steps', () => {
    const markup = render();

    expect(count(markup, '<ol')).toBe(1);
    const order = ['Crie sua conta', 'Venda', 'Feche o dia'].map((title) => markup.indexOf(`>${title}<`));
    expect(order.every((position) => position > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('states the safety claims exactly as the product delivers them', () => {
    const markup = render();

    expect(markup).toContain('6 dígitos');
    expect(markup).toContain('venda simples em dinheiro');
    expect(markup).toContain('Cartão, Pix e fiado precisam de internet');
  });

  it('answers the questions in plain language, free for now and without any price', () => {
    const markup = render();

    expect(markup).toContain('É gratuito?');
    expect(count(markup, '<details')).toBeGreaterThanOrEqual(3);
    expect(markup).not.toMatch(/R\$\s?\d+[,.]\d{2}\s*\/\s*mês/i);
    expect(markup).not.toMatch(/\bplano\b/i);
  });

  it('repeats the sign up action at the end of the page', () => {
    const markup = render();

    expect(count(markup, 'href="/login?modo=cadastro"')).toBeGreaterThanOrEqual(2);
  });

  it('keeps a single h1 and the heading order', () => {
    const markup = render();

    expect(count(markup, '<h1')).toBe(1);
    expect(count(markup, '<h2')).toBeGreaterThanOrEqual(5);
    expect(markup).not.toMatch(/<h4/);
  });

  it('describes the cash close as it works today: compare, and ask for a justification', () => {
    const markup = render();

    expect(markup).not.toMatch(/sem ver/i);
    expect(markup).not.toMatch(/cego/i);
    expect(markup).toContain('justificativa');
  });

  it('styles the page with the global tokens only', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'landing.css'), 'utf8');

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(css).not.toContain('--font-display');
    expect(css).not.toContain('--font-geist-sans');
    // The design sets the landing in the system font, unlike the app screens (Inter).
    expect(css).toMatch(/font-family:\s*system-ui/);
    expect(css).toContain('var(--primary)');
    expect(css).not.toMatch(/^\s*--[\w-]+\s*:/m);
  });

  it('respects reduced motion in the styles', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'landing.css'), 'utf8');

    expect(css).toContain('prefers-reduced-motion');
  });
});
