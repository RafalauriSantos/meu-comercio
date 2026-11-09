import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const css = readFileSync(join(root, 'src', 'frontend', 'styles', 'management.css'), 'utf8');
// The classes of the page and of the pieces it is built from.
const page = [
  join(root, 'src', 'app', 'gestao', 'page.tsx'),
  join(root, 'src', 'frontend', 'management', 'import-products-panel.tsx'),
]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

function classesInCss(text: string): Set<string> {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...withoutComments.matchAll(/\.(mg-[a-z0-9-]+)/g)].map((m) => m[1]));
}

function classesInPage(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/mg-[a-z0-9-]+/g)) found.add(m[0]);
  return found;
}

describe('management.css', () => {
  it('is independent from the PDV stylesheet', () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toContain('pdv.css');
  });

  it('uses design tokens only: no hex colors, no --pdv-* or --font-geist-* variables', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/--pdv-/);
    expect(css).not.toMatch(/--font-geist/);
  });

  it('defines every mg- class the page uses and nothing the page does not use', () => {
    const defined = classesInCss(css);
    const used = classesInPage(page);
    // Modifiers built from a runtime value in the page (mg-stock-${status})
    for (const status of ['low', 'out']) used.add(`mg-stock-${status}`);
    used.delete('mg-stock-');
    used.delete('mg-stock-ok');

    expect([...used].filter((c) => !defined.has(c)).sort()).toEqual([]);
    // mg-stock-ok has no rule on purpose: the default cell style is the "ok" style
    expect([...defined].filter((c) => !used.has(c)).sort()).toEqual([]);
  });

  it('respects prefers-reduced-motion for the credit limit bar', () => {
    expect(css).toMatch(/prefers-reduced-motion: no-preference/);
  });
});

describe('gestao page markup', () => {
  it('has no hard-coded colors or legacy PDV variables in inline styles', () => {
    expect(page).not.toMatch(/#[0-9a-fA-F]{3,8}['"]/);
    expect(page).not.toMatch(/--pdv-/);
  });

  it('uses the shared app header and no longer renders its own page heading bar', () => {
    expect(page).toContain('<AppHeader');
    expect(page).toContain('active="gestao"');
    expect(page).not.toContain('page-heading');
    expect(page).not.toContain('Voltar ao PDV Balcão');
  });

  it('keeps the blind count: the expected cash value is never rendered', () => {
    expect(page).not.toMatch(/formatMoney\(\s*cashSession\.expectedCash/);
    expect(page).not.toMatch(/formatMoney\(\s*expectedCashNum/);
  });
});
