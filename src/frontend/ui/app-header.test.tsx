import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from './app-header';

function render(props: Partial<Parameters<typeof AppHeader>[0]> = {}): string {
  return renderToStaticMarkup(<AppHeader active="venda" onLogout={() => {}} {...props} />);
}

// The opening tag of the link whose text is `label`, whatever the attribute order.
function link(markup: string, label: string): string {
  return markup.match(new RegExp(`<a[^>]*>(?=${label}</a>)`))?.[0] ?? '';
}

describe('AppHeader', () => {
  it('marks only the active section as the current page', () => {
    const venda = render({ active: 'venda' });
    expect(link(venda, 'Venda')).toContain('aria-current="page"');
    expect(link(venda, 'Gestão')).not.toContain('aria-current');

    const gestao = render({ active: 'gestao' });
    expect(link(gestao, 'Gestão')).toContain('aria-current="page"');
    expect(link(gestao, 'Venda')).not.toContain('aria-current');
  });

  it('shows no install button until the browser says the app can be installed', () => {
    expect(render()).not.toContain('Instalar app');
  });

  it('links the sections to the PDV and to the management panel', () => {
    const markup = render();
    expect(link(markup, 'Venda')).toContain('href="/pdv"');
    expect(link(markup, 'Gestão')).toContain('href="/gestao"');
  });

  it('shows the operator role and the clock only when given', () => {
    expect(render({ username: 'maria', isOwner: true, clock: '13:16' })).toContain('maria · Dona');
    expect(render({ username: 'joao', isOwner: false })).toContain('joao · Operador');
    expect(render({ username: 'joao' })).not.toContain('app-clock');
    expect(render({ clock: '13:16' })).toContain('13:16');
  });

  it('reserves the width of the user name while the user is unknown, without any text', () => {
    const markup = render({ username: undefined, isOwner: undefined });
    const reserve = markup.match(/<span[^>]*min-width:\s*110px[^>]*>/)?.[0] ?? '';

    expect(reserve).toContain('aria-hidden="true"');
    expect(markup).not.toContain('Dona');
    expect(markup).not.toContain('Operador');
    expect(markup).not.toContain('·');
  });

  it('has no reserve once the user name is known', () => {
    const markup = render({ username: 'maria', isOwner: true });

    expect(markup).not.toMatch(/min-width:\s*110px/);
    expect(markup).toContain('maria · Dona');
  });

  it('keeps the links, the active mark and Sair while the user is unknown', () => {
    const markup = render({ active: 'gestao' });

    expect(link(markup, 'Gestão')).toContain('aria-current="page"');
    expect(link(markup, 'Venda')).toContain('href="/pdv"');
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
  });

  it('has a logout button and a labelled navigation', () => {
    const markup = render();
    expect(markup).toContain('aria-label="Principal"');
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
  });
});
