import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'auth.css'), 'utf8');

describe('auth.css', () => {
  it('uses only the global tokens: no hard-coded color, no own token set, no display font', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/^\s*--[\w-]+\s*:/m);
    expect(css).not.toContain('--font-display');
    expect(css).not.toContain('--font-geist-sans');
  });

  it('respects reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });

  it('keeps every control at least 44 px to touch', () => {
    expect(css).toMatch(/\.auth-submit\s*\{[^}]*min-height:\s*56px/);
    expect(css).toMatch(/\.cash-quick button\s*\{[^}]*min-height:\s*48px/);
    // The show-password button is drawn 40px high, as designed; its touch area reaches 44px.
    expect(css).toMatch(/\.auth-toggle\s*\{[^}]*height:\s*40px/);
    expect(css).toMatch(/\.auth-toggle::after\s*\{[^}]*inset:\s*-2px/);
    // The footer link is drawn like a line of text, as designed; its touch area is taller than the line.
    expect(css).toMatch(/\.auth-link::after\s*\{[^}]*inset:\s*-14px/);
  });

  it('draws the show-password button as a borderless eye icon', () => {
    const field = readFileSync(join(process.cwd(), 'src', 'frontend', 'auth', 'password-field.tsx'), 'utf8');

    expect(css).toMatch(/\.auth-toggle\s*\{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.auth-toggle\s*\{[^}]*width:\s*40px/);
    expect(css).not.toMatch(/\.auth-toggle\s*\{[^}]*border:/);
    // An icon-only button keeps its accessible name and shows no text.
    expect(field).toContain("aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}");
    expect(field).toContain('<svg');
    expect(field).not.toMatch(/>\s*Mostrar\s*</);
  });

  it('is a single centered card, top aligned, with no two-column layout or old tabs', () => {
    expect(css).toMatch(/\.auth-card\s*\{[^}]*max-width:\s*420px/);
    expect(css).toMatch(/\.auth-card-wide\s*\{[^}]*max-width:\s*540px/);
    expect(css).not.toContain('grid-template-columns: minmax(0, 1.1fr)');
    expect(css).not.toContain('.auth-tab');
    expect(css).not.toContain('.auth-brand-shot');
    expect(css).not.toContain('.auth-claims');
  });

  it('draws the open cash register title at 44 px', () => {
    expect(css).toMatch(/\.cash-title\s*\{[^}]*font-size:\s*44px/);
  });
});
