import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomerItem } from '@/frontend/lib/api-client';
import { draftFromCustomer } from './customer-edit';
import { CustomerEditPanel } from './customer-edit-panel';

const maria: CustomerItem = { id: 'c1', name: 'Maria Souza', phone: '11981642350', creditLimit: '100.00', updatedAt: '2026-11-16T10:00:00.000Z' };
const old: CustomerItem = { ...maria, phone: '6261616161649496169' };

const noop = () => {};
function render(over: Partial<React.ComponentProps<typeof CustomerEditPanel>> = {}) {
  const target = over.target ?? maria;
  return renderToStaticMarkup(
    <CustomerEditPanel
      target={target}
      draft={draftFromCustomer(target)}
      debtCents={8550}
      processing={false}
      closing={false}
      error={null}
      nameRef={{ current: null }}
      onDraft={noop}
      onSubmit={noop}
      onCancel={noop}
      onClosed={noop}
      onReload={noop}
      {...over}
    />
  );
}

describe('CustomerEditPanel', () => {
  it('opens with the phone and the limit masked, Salvar disabled and the hint shown', () => {
    const html = render();
    expect(html).toContain('value="(11) 98164-2350"');
    expect(html).toContain('value="100,00"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Salvar<\/button>/);
    expect(html).toContain('Altere algo para poder salvar.');
    expect(html).toContain('Dívida atual: R$ 85,50');
    expect(html).toContain('R$ 100.000,00');
  });

  it('is a modal dialog panel named by its title, with Fechar, not open and not closing', () => {
    const html = render();
    const labelledBy = html.match(/<dialog[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toMatch(new RegExp(`<h2 id="${labelledBy}"[^>]*>Editar cliente</h2>`));
    expect(html).toContain('class="mg-panel"');
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).not.toMatch(/<dialog[^>]*(data-closing|inert)/);
    expect(html).toMatch(/<button[^>]*aria-label="Fechar"[^>]*>×<\/button>/);
  });

  it('ties each label to its input', () => {
    const html = render();
    for (const label of ['Nome', 'Telefone / WhatsApp', 'Limite de fiado (R$)']) {
      const forId = html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label.replace(/[()$]/g, '\\$&')}</label>`))?.[1];
      expect(forId, label).toBeTruthy();
      expect(html).toContain(`id="${forId}"`);
    }
  });

  it('marks an old phone as off pattern, and a standard one not', () => {
    expect(render({ target: old })).toContain('Telefone fora do padrão');
    expect(render()).not.toContain('Telefone fora do padrão');
  });

  it('warns without blocking when the limit is under the debt', () => {
    const html = render({ draft: { ...draftFromCustomer(maria), limit: '50,00' } });
    expect(html).toContain('O limite é menor que a dívida');
    expect(html).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>Salvar<\/button>/);
    expect(render({ draft: { ...draftFromCustomer(maria), limit: '85,50' } })).not.toContain('O limite é menor');
  });

  it('shows Salvando... while sending', () => {
    const html = render({ processing: true, draft: { ...draftFromCustomer(maria), name: 'Maria S.' } });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Salvando\.\.\.<\/button>/);
  });

  it('shows the error with Recarregar only for a conflict', () => {
    const conflict = render({ error: { text: 'Cliente alterado.', reload: true } });
    expect(conflict).toContain('Cliente alterado.');
    expect(conflict).toContain('Recarregar');
    const plain = render({ error: { text: 'Telefone já cadastrado.', reload: false } });
    expect(plain).toContain('Telefone já cadastrado.');
    expect(plain).not.toContain('Recarregar');
  });
});
