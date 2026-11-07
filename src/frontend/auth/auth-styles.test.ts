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
    expect(css).toMatch(/\.auth-btn-primary[^}]*min-height:\s*5\d?px/);
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
});
