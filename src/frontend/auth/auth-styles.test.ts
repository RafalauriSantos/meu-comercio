import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'auth.css'), 'utf8');

describe('auth.css', () => {
  it('respects reduced motion and shows a visible keyboard focus', () => {
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain(':focus-visible');
  });

  it('keeps every control at least 44 px tall', () => {
    expect(css).toMatch(/\.auth-btn-primary[^}]*min-height:\s*5\dpx/);
    expect(css).toMatch(/\.auth-tab\b[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.auth-toggle[^}]*min-height:\s*44px/);
  });

  it('is in the landing world, not the old light card', () => {
    expect(css).not.toContain('#f0fdf4');
    expect(css).not.toContain('.auth-pill');
    expect(css).not.toContain('.auth-icon-badge');
    expect(css).toContain('--ground: #0b1220');
    expect(css).toContain('--green: #34d399');
  });

  it('is two columns on desktop and one on a phone, without dead layout classes', () => {
    expect(css).toMatch(/@media \(min-width: 960px\)[\s\S]*grid-template-columns/);
    expect(css).not.toContain('.auth-wrapper');
    expect(css).not.toContain('.auth-card');
  });

  it('draws the field boundary with at least 3:1 contrast on both grounds (WCAG 1.4.11)', () => {
    const token = (name: string): string => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string): number => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    const border = token('field-border');
    expect(border).not.toBe('');
    expect(contrast(border, token('ground'))).toBeGreaterThanOrEqual(3);
    expect(contrast(border, token('surface'))).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.auth-input\s*\{[^}]*border:\s*1px solid var\(--field-border\)/);
  });
});
