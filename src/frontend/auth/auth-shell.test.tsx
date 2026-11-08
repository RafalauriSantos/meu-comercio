import { describe, it, expect } from 'vitest';
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
