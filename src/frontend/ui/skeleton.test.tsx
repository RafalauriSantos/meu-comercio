import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { readScreenFiles, readScreenSource } from '@/test-utils/read-screen-source';
import { Skeleton } from './skeleton';
import { AppHeaderSkeleton } from './app-header-skeleton';
import { PdvMainSkeleton, PdvSideSkeleton, PdvStatusSkeleton } from '../pdv/pdv-skeleton';
import { ManagementDataSkeleton } from '../management/management-skeleton';
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

  it('draws the PDV main piece with the cart layout and announces the loading once', () => {
    const markup = renderToStaticMarkup(<PdvMainSkeleton shape />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Carregando o terminal de vendas');
    expect(markup).toContain('pdv-cart');
    expect(count(markup, 'class="skeleton')).toBeGreaterThan(5);
    // The header and the page frame belong to the real page now, and the placeholders are not content.
    expect(markup).not.toContain('<header');
    expect(markup).not.toContain('app-header');
    expect(markup).not.toContain('Iniciando terminal');
    expect(markup).not.toMatch(/<h[1-6][\s>]/);
  });

  it('draws the PDV side and status pieces in the same grid cells, silent for screen readers', () => {
    const side = renderToStaticMarkup(<PdvSideSkeleton shape />);
    const status = renderToStaticMarkup(<PdvStatusSkeleton shape />);

    for (const part of ['<aside', 'pdv-side', 'pdv-total-card', 'pdv-methods-card']) expect(side).toContain(part);
    for (const part of ['<footer', 'pdv-status']) expect(status).toContain(part);
    for (const markup of [side, status]) {
      expect(markup).not.toContain('role="status"');
      expect(markup).not.toContain('sr-only');
      expect(count(markup, 'class="skeleton')).toBeGreaterThan(3);
      expect(markup).not.toContain('<header');
    }
  });

  it('reserves the PDV space without anything visible when shape is false', () => {
    const pieces = [
      <PdvMainSkeleton key="main" shape={false} />,
      <PdvSideSkeleton key="side" shape={false} />,
      <PdvStatusSkeleton key="status" shape={false} />,
    ];
    for (const piece of pieces) {
      const markup = renderToStaticMarkup(piece);

      expect(markup).toMatch(/^<[a-z]+[^>]*style="[^"]*visibility:\s*hidden/);
      expect(markup).not.toContain('role="status"');
      expect(markup).not.toContain('aria-busy');
      expect(markup).not.toContain('sr-only');
      expect(markup).not.toContain('Carregando');
    }
  });

  it('draws the management data area (no header, no title) and announces the loading once', () => {
    const markup = renderToStaticMarkup(<ManagementDataSkeleton shape />);

    expect(count(markup, 'role="status"')).toBe(1);
    expect(markup).toContain('aria-busy="true"');
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Carregando o painel de gestão');
    for (const part of ['mg-tabs', 'mg-summary', 'mg-card-flush']) {
      expect(markup).toContain(part);
    }
    // The title and the header are real on the page: no gray block in their place.
    expect(markup).not.toContain('<header');
    expect(markup).not.toContain('mg-titlebar');
    expect(markup).not.toMatch(/<h[1-6][\s>]/);
  });

  it('reserves the management data area without anything visible when shape is false', () => {
    const markup = renderToStaticMarkup(<ManagementDataSkeleton shape={false} />);

    expect(markup).toMatch(/^<[a-z]+[^>]*style="[^"]*visibility:\s*hidden/);
    expect(markup).toContain('mg-tabs');
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('aria-busy');
    expect(markup).not.toContain('sr-only');
    expect(markup).not.toContain('Carregando');
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
  // The whole screen: the page plus the files of the area folder.
  const pdv = readScreenSource('pdv');
  const management = readScreenSource('gestao');
  const login = read('src', 'app', 'login', 'page.tsx');

  it('shows them instead of the old white loading texts', () => {
    expect(pdv).toContain('<PdvMainSkeleton');
    expect(pdv).toContain('<PdvSideSkeleton');
    expect(pdv).toContain('<PdvStatusSkeleton');
    expect(management).toContain('<ManagementDataSkeleton');
    expect(login).toContain('<AuthFormSkeleton />');
    expect(pdv).not.toContain('Iniciando terminal PDV');
    expect(management).not.toContain('Carregando Painel de Gestão');
    expect(login).not.toContain('Verificando o sistema');
  });

  it('feeds the delay gate into the skeletons, with the default delay', () => {
    for (const page of [pdv, management]) {
      expect(page).toContain('useSkeletonGate(loading)');
      expect(page).toMatch(/const shape = skeletonGate === 'skeleton';/);
      expect(page).toMatch(/shape=\{shape\}/);
    }
  });

  it('has no early return for the loading state: the header and the title are always rendered', () => {
    for (const page of [pdv, management]) {
      expect(page).not.toMatch(/if \(skeletonGate/);
      expect(page).not.toMatch(/if \(loading\)\s*\{?\s*return/);
      expect(page).not.toMatch(/^  return null;/m); // the component body, not a helper inside a handler
      expect(page).not.toMatch(/\b(PdvSkeleton|ManagementSkeleton)\b/);
    }
  });

  // The order is read inside ONE file, the one that renders the AppHeader: in a text made of many files
  // an indexOf would compare positions across files, which depend on the order they are joined in.
  it('puts the real header before the first loading condition in the page text', () => {
    const screenFile = (screen: 'pdv' | 'gestao') => {
      const withHeader = readScreenFiles(screen).filter((f) => /<AppHeader\b/.test(f.text));
      expect(withHeader.map((f) => f.file), `${screen}: the file that renders the AppHeader`).toHaveLength(1);
      return withHeader[0].text;
    };
    const pdvText = screenFile('pdv');
    const managementText = screenFile('gestao');
    const first = (page: string) => page.indexOf('loading ?');
    expect(first(pdvText)).toBeGreaterThan(-1);
    expect(first(managementText)).toBeGreaterThan(-1);
    expect(pdvText.indexOf('<AppHeader')).toBeLessThan(first(pdvText));
    expect(managementText.indexOf('<AppHeader')).toBeLessThan(first(managementText));
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
