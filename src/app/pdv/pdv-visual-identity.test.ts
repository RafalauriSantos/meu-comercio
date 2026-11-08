import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const css = readFileSync(join(root, 'src', 'frontend', 'styles', 'pdv.css'), 'utf8');
const page = readFileSync(join(root, 'src', 'app', 'pdv', 'page.tsx'), 'utf8');

// Everything outside the thermal-receipt @media print block, which may use plain black and white.
const screenCss = css.slice(0, css.indexOf('@media print'));

describe('PDV visual identity', () => {
  it('has a print block for the thermal receipt', () => {
    expect(css).toContain('@media print');
    expect(css).toContain('.thermal-print-area');
    expect(css).toContain('width: 58mm');
  });

  it('uses only tokens for color on screen (no hex or rgb literals)', () => {
    expect(screenCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(screenCss).not.toMatch(/\brgba?\(/);
  });

  it('does not use the old --pdv-* or --font-geist-* variables', () => {
    expect(css).not.toMatch(/--pdv-/);
    expect(css).not.toMatch(/--font-geist/);
    expect(page).not.toMatch(/--pdv-/);
  });

  it('does not redefine the shared primitives or the page ground', () => {
    expect(css).not.toMatch(/^(body|html|:root|\*)\b/m);
    expect(css).not.toMatch(/^\.(primary|soft|ghost|card|notice|error)\b/m);
  });

  it('renders the shared AppHeader instead of its own topbar', () => {
    expect(page).toContain("import { AppHeader } from '@/frontend/ui/app-header'");
    expect(page).toContain('<AppHeader');
    expect(page).toContain('active="venda"');
    expect(page).not.toContain('className="topbar"');
  });

  it('keeps the shortcut keys wired', () => {
    for (const key of ["'Escape'", "'F2'", "'F4'"]) expect(page).toContain(key);
  });

  it('keeps the class names the print code relies on', () => {
    expect(page).toContain('thermal-print-area');
    expect(page).toContain('no-print');
  });

  it('reduces motion when the user asks for it', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
