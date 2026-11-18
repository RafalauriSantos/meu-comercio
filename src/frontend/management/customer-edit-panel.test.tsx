import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomerItem } from '@/frontend/lib/api-client';
import { draftFromCustomer } from './customer-edit';
import { CustomerEditPanel } from './customer-edit-panel';
import type { DeleteFlowView } from './delete-pieces';

const maria: CustomerItem = { id: 'c1', name: 'Maria Souza', phone: '11981642350', creditLimit: '100.00', updatedAt: '2026-11-16T10:00:00.000Z' };
const old: CustomerItem = { ...maria, phone: '6261616161649496169' };

const noop = () => {};
const flow: DeleteFlowView = { asking: false, pin: '', error: null, onAsk: noop, onCancel: noop, onPin: noop, onConfirm: noop, onReload: noop };
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
      deleteFlow={flow}
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
    expect(html).toContain('O limite vai até R$ 500,00.');
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

  it('has the Fiado bloqueado switch, labelled, with the help text and the server value', () => {
    const html = render();
    const forId = html.match(/<label[^>]*for="([^"]+)"[^>]*>Fiado bloqueado<\/label>/)?.[1];
    expect(forId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input id="${forId}" type="checkbox" role="switch"`));
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toContain('O cliente continua comprando à vista e pode pagar o que deve. Só o fiado fica barrado.');
    const blocked = render({ target: { ...maria, creditBlocked: true }, draft: draftFromCustomer({ ...maria, creditBlocked: true }) });
    expect(blocked).toMatch(/type="checkbox"[^>]*checked/);
  });

  it('enables Salvar when only the switch changed', () => {
    const html = render({ draft: { ...draftFromCustomer(maria), creditBlocked: true } });
    expect(html).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>Salvar<\/button>/);
  });

  it('asks for the owner PIN only when the limit goes up, and Salvar needs 6 digits', () => {
    expect(render()).not.toContain('>PIN da proprietária<');
    expect(render({ draft: { ...draftFromCustomer(maria), limit: '50,00' } })).not.toContain('>PIN da proprietária<');
    const up = render({ draft: { ...draftFromCustomer(maria), limit: '125,00' } });
    expect(up).toContain('>PIN da proprietária<');
    expect(up).toContain('Por segurança, aumentar o limite pede o seu PIN.');
    expect(up).toMatch(/<input[^>]*type="password"[^>]*inputMode="numeric"/);
    expect(up).toMatch(/<button[^>]*disabled=""[^>]*>Salvar<\/button>/);
    const typed = render({ draft: { ...draftFromCustomer(maria), limit: '125,00', ownerPin: '123456' } });
    expect(typed).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>Salvar<\/button>/);
  });

  it('shows Salvando... while sending', () => {
    const html = render({ processing: true, draft: { ...draftFromCustomer(maria), name: 'Maria S.' } });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Salvando\.\.\.<\/button>/);
  });

  it('with a debt, locks Excluir cliente and says why; the help text is gone', () => {
    const html = render({ debtCents: 8550 });
    expect(html).toContain('Excluir cliente</h3>');
    expect(html).toContain('Este cliente deve R$ 85,50. Receba o valor para poder excluir.');
    expect(html).toMatch(/<button[^>]*class="outline mg-danger"[^>]*disabled=""[^>]*>Excluir cliente<\/button>/);
    expect(html).not.toContain('O cliente sai das listas e do caixa.');
  });

  it('with the balance not loaded yet, locks Excluir cliente and asks to wait', () => {
    const html = render({ debtCents: null });
    expect(html).toContain('Aguarde o saldo carregar.');
    expect(html).toMatch(/<button[^>]*class="outline mg-danger"[^>]*disabled=""[^>]*>Excluir cliente<\/button>/);
  });

  it('with a zero debt, shows the help text and an enabled Excluir cliente', () => {
    const html = render({ debtCents: 0 });
    expect(html).toContain('O cliente sai das listas e do caixa. O histórico de vendas e de fiado fica guardado.');
    expect(html).toMatch(/<button[^>]*class="outline mg-danger"(?![^>]*disabled)[^>]*>Excluir cliente<\/button>/);
  });

  it('the confirmation asks for the owner PIN (6 digits, password, numeric), with its help, and Excluir waits for 6 digits', () => {
    const html = render({ debtCents: 0, deleteFlow: { ...flow, asking: true } });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Excluir Maria Souza?');
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>PIN da proprietária<\/label>/);
    expect(html).toMatch(/<input[^>]*class="input num mg-pin"[^>]*type="password"[^>]*inputMode="numeric"[^>]*maxLength="6"/);
    expect(html).toContain('Por segurança, excluir um cliente pede o seu PIN (6 dígitos).');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Excluir<\/button>/);
    const ready = render({ debtCents: 0, deleteFlow: { ...flow, asking: true, pin: '123456' } });
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Excluir<\/button>/);
    const short = render({ debtCents: 0, deleteFlow: { ...flow, asking: true, pin: '12345' } });
    expect(short).toMatch(/<button[^>]*disabled=""[^>]*>Excluir<\/button>/);
  });

  it('shows the PIN or debt error from the server in the confirmation, without the technical code', () => {
    const html = render({ debtCents: 0, deleteFlow: { ...flow, asking: true, error: { text: 'PIN de autorização da proprietária inválido.', reload: false } } });
    expect(html).toContain('PIN de autorização da proprietária inválido.');
    expect(html).not.toContain('CUSTOMER_HAS_DEBT');
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
