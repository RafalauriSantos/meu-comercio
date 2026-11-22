import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScreenSource } from '@/test-utils/read-screen-source';

const root = process.cwd();
const css = readFileSync(join(root, 'src', 'frontend', 'styles', 'management.css'), 'utf8');
// The classes of the whole screen: the page plus every file of src/frontend/management (no fixed list).
const page = readScreenSource('gestao');

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
    // The direction of the change in the sales report (mg-delta-${direction}).
    for (const direction of ['up', 'down', 'same']) used.add(`mg-delta-${direction}`);
    used.delete('mg-delta-');
    used.delete('mg-stock-ok');

    expect([...used].filter((c) => !defined.has(c)).sort()).toEqual([]);
    // mg-stock-ok has no rule on purpose: the default cell style is the "ok" style
    expect([...defined].filter((c) => !used.has(c)).sort()).toEqual([]);
  });

  it('respects prefers-reduced-motion for the credit limit bar', () => {
    expect(css).toMatch(/prefers-reduced-motion: no-preference/);
  });
});

describe('edit side panel css', () => {
  it('locks the page scroll while the panel is open and dims the background with the overlay token', () => {
    expect(css).toMatch(/body:has\(\.mg-panel\[open\]\)\s*\{\s*overflow: hidden;/);
    expect(css).toMatch(/\.mg-panel::backdrop\s*\{\s*background: var\(--overlay\);/);
  });

  it('is 440px on the right and takes the full screen on a phone, with the actions stacked', () => {
    expect(css).toMatch(/\.mg-panel \{[^}]*width: min\(440px, 100%\)/);
    const phone = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
    expect(phone).toMatch(/\.mg-panel \{[^}]*width: 100%/);
    expect(phone).toMatch(/\.mg-panel-actions \{[^}]*flex-direction: column-reverse/);
    expect(phone).toMatch(/\.mg-panel-actions > \* \{[^}]*width: 100%/);
  });
});

describe('side panel enter and exit animation css', () => {
  const lf = css.replace(/\r\n/g, '\n');
  const start = lf.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .management-page .mg-panel');
  const motion = start < 0 ? '' : lf.slice(start, lf.indexOf('\n}\n', start));
  const ease = 'cubic-bezier\\(0\\.22, 1, 0\\.36, 1\\)';
  const accel = 'cubic-bezier\\(0\\.5, 0, 0\\.75, 0\\)';

  it('animates only inside no-preference, so reduced motion and old browsers just show and hide', () => {
    expect(start).toBeGreaterThan(-1);
    expect(motion).toMatch(new RegExp(`transition:\\s*transform 240ms ${ease}`));
    expect(motion).toMatch(new RegExp(`overlay 240ms ${ease} allow-discrete`));
    expect(motion).toMatch(new RegExp(`display 240ms ${ease} allow-discrete`));
  });

  it('enters from the right with @starting-style (translateX(100%) to 0) and fades the backdrop in', () => {
    expect(motion).toMatch(/@starting-style \{\s*\.management-page \.mg-panel\[open\] \{\s*transform: translateX\(100%\)/);
    expect(motion).toMatch(/@starting-style \{[^@]*\.mg-panel\[open\]::backdrop \{\s*opacity: 0/);
    expect(motion).toMatch(/\.mg-panel\[open\] \{[^}]*transform: translateX\(0\)/);
    expect(motion).toMatch(new RegExp(`\\.mg-panel::backdrop \\{[^}]*opacity: 1[^}]*transition:[^;]*opacity 240ms ${ease}`));
  });

  it('exits in 180ms with an accelerating curve: slides back and fades the backdrop out while still open', () => {
    expect(motion).toMatch(new RegExp(`\\.mg-panel\\[open\\]\\[data-closing\\] \\{[^}]*transform: translateX\\(100%\\)[^}]*transition:\\s*transform 180ms ${accel}`));
    expect(motion).toMatch(new RegExp(`\\.mg-panel\\[open\\]\\[data-closing\\]::backdrop \\{[^}]*opacity: 0[^}]*transition:\\s*opacity 180ms ${accel}`));
  });

  it('keeps the page scroll locked during the exit: the dialog stays [open] until the app unmounts it', () => {
    expect(css).toMatch(/body:has\(\.mg-panel\[open\]\)\s*\{\s*overflow: hidden;/);
    expect(css).not.toContain(':not([data-closing])');
  });

  it('hides a dialog that is not open yet, so the entrance starts when showModal() runs', () => {
    expect(css).toMatch(/\.mg-panel:not\(\[open\]\) \{\s*display: none;/);
  });

  it('uses the same entrance on the phone (no phone override of the transform)', () => {
    expect(css.slice(css.lastIndexOf('@media (max-width: 600px)'))).not.toMatch(/translate/);
  });
});

describe('catalog phone css (max-width 600px)', () => {
  const marker = '@media (max-width: 600px)';
  const phone = css.slice(css.lastIndexOf(marker));
  const desktop = css.slice(0, css.lastIndexOf(marker));

  it('keeps the desktop list as it was: grid columns and the 560px minimum width outside the phone block', () => {
    expect(desktop).toMatch(/\.mg-list \{[^}]*min-width: 560px/);
    expect(desktop).toMatch(/\.mg-list-head,\s*\.management-page \.mg-row \{[^}]*grid-template-columns: var\(--mg-list-columns\)/);
    expect(phone).not.toMatch(/--mg-list-columns/);
  });

  it('drops the 560px minimum width of the list, so there is no horizontal scroll', () => {
    expect(phone).toMatch(/\.mg-list \{[^}]*min-width: 0/);
  });

  it('turns each row into a card with the name, code and price on the left and Editar on the right', () => {
    expect(phone).toMatch(/\.mg-list \.mg-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto[^}]*border-radius: 12px/);
    expect(phone).toMatch(/\.mg-list \.mg-row > :first-child strong \{[^}]*-webkit-line-clamp: 2/);
    expect(phone).toMatch(/\.mg-list \.mg-row > :nth-last-child\(2\) \{[^}]*grid-column: 1[^}]*font-weight: 700/);
    expect(phone).toMatch(/\.mg-list \.mg-row > :last-child \{[^}]*grid-column: 2[^}]*grid-row: 1 \/ span 2/);
  });

  it('makes Editar and Entrada at least 44px high', () => {
    expect(phone).toMatch(/\.mg-list \.mg-row-action \{[^}]*min-height: 44px/);
  });

  it('hides the column header visually but keeps it for screen readers', () => {
    expect(phone).toMatch(/\.mg-list-head \{[^}]*position: absolute[^}]*width: 1px[^}]*clip: rect\(0 0 0 0\)/);
  });

  it('with the stock on, adds Em estoque and Entrada as a third line of the card, and opens the restock inside the card', () => {
    expect(phone).toMatch(/\.mg-list-stock \.mg-row > :nth-child\(2\) \{[^}]*grid-column: 1[^}]*grid-row: 3/);
    expect(phone).toMatch(/\.mg-list-stock \.mg-row > :nth-child\(3\) \{[^}]*grid-column: 2[^}]*grid-row: 3/);
    expect(phone).toMatch(/\.mg-list \.mg-row:has\(\+ \.mg-restock-row\) \{[^}]*border-bottom-left-radius: 0/);
    expect(phone).toMatch(/\.mg-list \.mg-restock-row \{[^}]*border-radius: 0 0 12px 12px/);
    expect(phone).toMatch(/\.mg-restock \.input \{[^}]*width: 100%/);
  });

  it('stacks the summary', () => {
    expect(phone).toMatch(/\.mg-summary \{[^}]*flex-direction: column[^}]*align-items: stretch/);
  });

  it('stacks the toolbar: full-width search, Novo Produto 48px, Importar side by side', () => {
    expect(phone).toMatch(/\.mg-search \{[^}]*flex: 1 1 100%[^}]*max-width: none/);
    expect(phone).toMatch(/\.mg-toolbar-new \{[^}]*flex: 1 1 0[^}]*min-height: 48px/);
    expect(phone).toMatch(/\.mg-toolbar-import \{[^}]*flex: 1 1 0[^}]*min-height: 48px/);
  });

  it('makes the footer button full width and at least 44px', () => {
    expect(phone).toMatch(/\.mg-foot button \{[^}]*width: 100%[^}]*min-height: 44px/);
  });

  it('does not use position: fixed or sticky for the toolbar (it stays in the flow)', () => {
    expect(phone).not.toMatch(/position: (fixed|sticky)/);
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
