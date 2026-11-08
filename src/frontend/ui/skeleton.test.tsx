import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Skeleton } from './skeleton';
import { AppHeaderSkeleton } from './app-header-skeleton';
import { PdvSkeleton } from '../pdv/pdv-skeleton';
import { ManagementSkeleton } from '../management/management-skeleton';
import { AuthFormSkeleton } from '../auth/auth-skeleton';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('Skeleton', () => {
  it('is a decorative block with the given size', () => {
    const markup = renderToStaticMarkup(<Skeleton width={120} height={20} radius={10} />);

    expect(markup).toContain('class="skeleton"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width:120px');
    expect(markup).toContain('height:20px');
    expect(markup).toContain('border-radius:10px');
  });

  it('has a tone for the dark total block', () => {
    expect(renderToStaticMarkup(<Skeleton tone="on-ink" />)).toContain('class="skeleton skeleton-on-ink"');
  });
});

describe('screen skeletons', () => {
  it('keeps the brand and hides the placeholders from screen readers in the header', () => {
    const markup = renderToStaticMarkup(<AppHeaderSkeleton />);

    expect(markup).toContain('Meu Comércio');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('<button');
  });

  it('draws the PDV with its own layout and announces the loading once', () => {
    const markup = renderToStaticMarkup(<PdvSkeleton />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Carregando o terminal de vendas');
    for (const part of ['pdv-app', 'pdv-main', 'pdv-total-card', 'pdv-methods-card', 'pdv-status']) {
      expect(markup).toContain(part);
    }
    expect(count(markup, 'class="skeleton')).toBeGreaterThan(15);
    // No spinner and no old loading title.
    expect(markup).not.toContain('Iniciando terminal');
    expect(markup).not.toContain('<h1');
  });

  it('draws the management panel with its own layout and announces the loading once', () => {
    const markup = renderToStaticMarkup(<ManagementSkeleton />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Carregando o painel de gestão');
    for (const part of ['management-page', 'mg-titlebar', 'mg-tabs', 'mg-kpis', 'mg-card-flush']) {
      expect(markup).toContain(part);
    }
    // No headings: the placeholders are not content.
    expect(markup).not.toMatch(/<h[1-6][s>]/);
  });

  it('draws the sign in card and announces the check once', () => {
    const markup = renderToStaticMarkup(<AuthFormSkeleton />);

    expect(markup).toContain('role="status"');
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Verificando o sistema');
    expect(count(markup, 'class="skeleton')).toBeGreaterThanOrEqual(5);
    expect(markup).not.toContain('auth-loading-spinner');
  });
});

describe('where the skeletons are used', () => {
  it('shows them instead of the old white loading texts', () => {
    const pdv = read('src', 'app', 'pdv', 'page.tsx');
    const management = read('src', 'app', 'gestao', 'page.tsx');
    const login = read('src', 'app', 'login', 'page.tsx');

    expect(pdv).toContain('return <PdvSkeleton />;');
    expect(management).toContain('return <ManagementSkeleton />;');
    expect(login).toContain('<AuthFormSkeleton />');
    expect(pdv).not.toContain('Iniciando terminal PDV');
    expect(management).not.toContain('Carregando Painel de Gestão');
    expect(login).not.toContain('Verificando o sistema');
  });
});

describe('skeleton styles', () => {
  const css = read('src', 'app', 'globals.css');

  it('shimmers, and stands still under reduced motion', () => {
    expect(css).toMatch(/\.skeleton::after\s*\{[^}]*animation:\s*skeleton-shimmer/);
    expect(css).toContain('@keyframes skeleton-shimmer');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.skeleton::after\s*\{\s*animation:\s*none/);
  });

  it('generates the highlight element: a pseudo-element without content is never drawn', () => {
    expect(css).toMatch(/\.skeleton::after\s*\{\s*content:\s*'';/);
  });

  it('moves the highlight with transform, which does not repaint the block every frame', () => {
    const keyframes = css.match(/@keyframes skeleton-shimmer\s*\{[^@]*?\n\}/)?.[0] ?? '';

    expect(keyframes).toContain('translateX');
    expect(keyframes).not.toContain('background-position');
    expect(css).toMatch(/\.skeleton\s*\{[^}]*overflow:\s*hidden/);
  });

  it('keeps a visible fill where color-mix() is not supported', () => {
    // A plain declaration right before the color-mix() one: an unsupported value is dropped, and the
    // block would otherwise be transparent.
    expect(css).toMatch(/background-color:\s*var\(--surface-2\);[^}]*background-color:\s*color-mix\(/);
    expect(css).toMatch(/\.skeleton-on-ink\s*\{\s*background-color:\s*var\(--border-strong\);\s*background-color:\s*color-mix\(/);
  });

  it('uses only the tokens, so it follows the light and dark themes', () => {
    const block = css.slice(css.indexOf('.skeleton {'));

    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(block).toContain('var(--surface-2)');
  });
});
