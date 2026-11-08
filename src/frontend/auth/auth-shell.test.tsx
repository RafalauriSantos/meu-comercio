import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell } from './auth-shell';

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('AuthShell', () => {
  it('shows the logo and the wordmark above a single card, with one h1', () => {
    const markup = renderToStaticMarkup(
      <AuthShell labelledBy="t">
        <h1 id="t">Título do formulário</h1>
      </AuthShell>
    );

    expect(markup).toMatch(/<a[^>]*href="\/"[^>]*><svg[\s\S]*<\/svg>Meu Comércio<\/a>/);
    expect(count(markup, '<section')).toBe(1);
    expect(markup).toContain('aria-labelledby="t"');
    expect(count(markup, '<h1')).toBe(1);
  });

  it('is always light, like the landing, whatever the system theme is', () => {
    const markup = renderToStaticMarkup(
      <AuthShell>
        <p>x</p>
      </AuthShell>
    );
    const globals = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    const cashOpen = readFileSync(join(process.cwd(), 'src', 'frontend', 'auth', 'cash-open-screen.tsx'), 'utf8');

    expect(markup).toContain('<main class="auth" data-theme="light">');
    // The open cash register screen belongs to the same flow.
    expect(cashOpen).toContain('className="auth-app" data-theme="light"');
    // There is no dark theme to reach the page: the system dark mode is ignored.
    expect(globals).not.toContain('prefers-color-scheme: dark');
  });

  it('has no brand panel, screenshot or claims list', () => {
    const markup = renderToStaticMarkup(
      <AuthShell>
        <p>x</p>
      </AuthShell>
    );

    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<aside');
    expect(markup).not.toContain('<li');
  });

  it('widens the card for sign up and renders the footer line only when given', () => {
    const narrow = renderToStaticMarkup(<AuthShell>x</AuthShell>);
    const wide = renderToStaticMarkup(
      <AuthShell wide footer={<button type="button">Entrar</button>}>
        x
      </AuthShell>
    );

    expect(narrow).not.toContain('auth-card-wide');
    expect(narrow).not.toContain('auth-foot');
    expect(wide).toContain('auth-card-wide');
    expect(wide).toMatch(/<p class="auth-foot"><button[^>]*>Entrar<\/button><\/p>/);
  });
});
