import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_NEW_CUSTOMER } from './new-customer';
import { NewCustomerPanel } from './new-customer-panel';

const noop = () => {};
const filled = { ...EMPTY_NEW_CUSTOMER, name: 'Ana Lima', phone: '(11) 99999-8888' };

function render(over: Partial<React.ComponentProps<typeof NewCustomerPanel>> = {}) {
  return renderToStaticMarkup(
    <NewCustomerPanel
      isOwner
      draft={EMPTY_NEW_CUSTOMER}
      processing={false}
      closing={false}
      error={null}
      nameRef={{ current: null }}
      onDraft={noop}
      onSubmit={noop}
      onCancel={noop}
      onClosed={noop}
      {...over}
    />,
  );
}

const saveButton = /<button[^>]*type="submit"([^>]*)>(Salvar cliente|Salvando\.\.\.)<\/button>/;

describe('NewCustomerPanel', () => {
  it('is a modal dialog panel named by its title, with Fechar', () => {
    const html = render();
    const id = html.match(/<dialog[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toMatch(new RegExp(`<h2 id="${id}"[^>]*>Novo cliente</h2>`));
    expect(html).toContain('class="mg-panel"');
    expect(html).toMatch(/<button[^>]*aria-label="Fechar"[^>]*>×<\/button>/);
  });

  it('ties each label to its input', () => {
    const html = render();
    for (const label of ['Nome', 'Telefone', 'Limite de fiado \\(R\\$\\)']) {
      const forId = html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`))?.[1];
      expect(forId, label).toBeTruthy();
      expect(html).toContain(`id="${forId}"`);
    }
  });

  it('keeps Salvar cliente in the footer, disabled with the hint until name and phone are valid', () => {
    const empty = render();
    expect(empty).toMatch(/disabled=""[^>]*>Salvar cliente<\/button>/);
    expect(empty).toContain('Preencha o nome e o telefone para salvar.');
    const ok = render({ draft: filled });
    expect(ok.match(saveButton)?.[1]).not.toContain('disabled');
    expect(ok).not.toContain('Preencha o nome');
  });

  it('shows the phone error in red only for a full invalid number', () => {
    expect(render({ draft: { ...filled, phone: '(11) 11111-1111' } })).toMatch(/class="error" role="alert">Telefone inválido/);
    expect(render({ draft: { ...filled, phone: '(11) 9' } })).not.toContain('Telefone inválido');
    expect(render({ draft: filled })).not.toContain('Telefone inválido');
  });

  it('the operator sees the limit locked at 0,00 with the notice, and never a PIN field', () => {
    const html = render({ isOwner: false, draft: { ...filled, limit: '125,00' } });
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="0,00"/);
    expect(html).toContain('O cliente nasce com limite R$ 0,00. Só a proprietária libera valor para o fiado, editando o cliente.');
    expect(html).not.toContain('>PIN da proprietária<');
    expect(html.match(saveButton)?.[1]).not.toContain('disabled');
  });

  it('the owner types the limit up to R$ 500,00, and the PIN appears only with a limit above zero', () => {
    const none = render({ draft: filled });
    expect(none).toContain('O limite vai até R$ 500,00.');
    expect(none).not.toContain('>PIN da proprietária<');
    const up = render({ draft: { ...filled, limit: '125,00' } });
    expect(up).toContain('>PIN da proprietária<');
    expect(up).toContain('Por segurança, aumentar o limite pede o seu PIN.');
    expect(up).toMatch(/<input[^>]*type="password"[^>]*inputMode="numeric"/);
    expect(up).toMatch(/disabled=""[^>]*>Salvar cliente<\/button>/);
    const typed = render({ draft: { ...filled, limit: '125,00', ownerPin: '123456' } });
    expect(typed.match(saveButton)?.[1]).not.toContain('disabled');
  });

  it('shows the server error without closing, and Salvando... while sending', () => {
    expect(render({ error: 'PIN de autorização da proprietária inválido.' })).toContain('PIN de autorização da proprietária inválido.');
    expect(render({ draft: filled, processing: true })).toMatch(/disabled=""[^>]*>Salvando\.\.\.<\/button>/);
  });
});
