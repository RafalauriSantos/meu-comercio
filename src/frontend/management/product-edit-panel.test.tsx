import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductItem } from '@/frontend/lib/api-client';
import { draftFromProduct } from './product-edit';
import { ProductEditPanel } from './product-edit-panel';
import type { DeleteFlowView } from './delete-pieces';

const rice: ProductItem = { id: 'a', barcode: '789', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 12, updatedAt: '2026-11-16T10:00:00.000Z' };
const cheese: ProductItem = { id: 'q', barcode: '9', name: 'Queijo', salePrice: 42.9, availableQuantity: 2500, unit: 'KG' };

const noop = () => {};
const flow: DeleteFlowView = { asking: false, pin: '', error: null, onAsk: noop, onCancel: noop, onPin: noop, onConfirm: noop, onReload: noop };
function render(over: Partial<React.ComponentProps<typeof ProductEditPanel>> = {}) {
  const target = over.target ?? rice;
  return renderToStaticMarkup(
    <ProductEditPanel
      target={target}
      draft={draftFromProduct(target)}
      processing={false}
      barcodeNote={null}
      scanWarning={false}
      error={null}
      stockControl
      deleteFlow={flow}
      nameRef={{ current: null }}
      onDraft={noop}
      onSubmit={noop}
      closing={false}
      onClosed={noop}
      onCancel={noop}
      onReload={noop}
      onBarcodeBlur={noop}
      onBarcodeKeyDown={noop}
      onGenerateBarcode={noop}
      {...over}
    />
  );
}

describe('ProductEditPanel', () => {
  it('shows the price masked, with Salvar disabled while nothing changed and no warnings', () => {
    const html = render();
    expect(html).toContain('value="25,50"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Salvar<\/button>/);
    expect(html).not.toContain('etiquetas');
    expect(html).not.toContain('sem internet');
  });

  it('is a modal dialog named by its title, closed by a button labelled Fechar', () => {
    const html = render();
    const labelledBy = html.match(/<dialog[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`<h2 id="${labelledBy}"[^>]*>Editar produto</h2>`));
    expect(html).toContain('class="mg-panel"');
    // showModal() opens it: the markup must not carry the open attribute.
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toMatch(/<button[^>]*aria-label="Fechar"[^>]*>×<\/button>/);
  });

  it('while closing it is marked data-closing and inert (no second save during the exit), and not marked otherwise', () => {
    expect(render()).not.toMatch(/<dialog[^>]*(data-closing|inert)/);
    expect(render({ closing: true })).toMatch(/<dialog[^>]*data-closing="true"[^>]*inert=""|<dialog[^>]*inert=""[^>]*data-closing="true"/);
  });

  it('orders the fields Nome, Preço, Código and ties each label to its input', () => {
    const html = render();
    expect(html).toMatch(/Nome do Produto[\s\S]*Preço de Venda \(R\$\)[\s\S]*Código de Barras/);
    for (const field of ['name', 'price', 'barcode']) {
      expect(html).toContain(`for="edit-${field}-a"`);
      expect(html).toContain(`id="edit-${field}-a"`);
    }
  });

  it('shows the hint to change something only while nothing changed', () => {
    const base = draftFromProduct(rice);
    expect(render()).toContain('Altere algo para poder salvar.');
    expect(render({ draft: { ...base, name: 'Arroz 1kg' } })).not.toContain('Altere algo para poder salvar.');
  });

  it('has Cancelar (not a submit) and Salvar (the submit) in the footer', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*class="outline"[^>]*type="button"[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<button[^>]*class="primary"[^>]*type="submit"[^>]*>Salvar<\/button>/);
  });

  it('warns about labels only when the barcode differs, and about offline cashiers only when the price differs', () => {
    const base = draftFromProduct(rice);
    const barcode = render({ draft: { ...base, barcode: '111' } });
    expect(barcode).toContain('As etiquetas impressas com o código antigo deixam de funcionar');
    expect(barcode).not.toContain('Caixas sem internet');
    expect(barcode).not.toMatch(/<button[^>]*disabled=""[^>]*>Salvar<\/button>/);

    const price = render({ draft: { ...base, price: '26,00' } });
    expect(price).toContain('Caixas sem internet ainda vendem pelo preço antigo');
    expect(price).not.toContain('etiquetas');
  });

  it('labels the price by unit', () => {
    expect(render()).toContain('Preço de Venda (R$)');
    expect(render({ target: cheese })).toContain('Preço por Quilo (R$)');
  });

  it('shows the error with role alert, and Recarregar a lista only when it asks for a reload', () => {
    const plain = render({ error: { text: 'Só a proprietária pode editar produtos.', reload: false } });
    expect(plain).toContain('role="alert"');
    expect(plain).toContain('Só a proprietária pode editar produtos.');
    expect(plain).not.toContain('Recarregar a lista');

    const reload = render({ error: { text: 'Este produto foi alterado', reload: true } });
    expect(reload).toContain('Recarregar a lista');
  });

  it('shows the barcode taken note and Salvando... while processing', () => {
    const html = render({ barcodeNote: 'Este código já está cadastrado: Feijão.', processing: true });
    expect(html).toContain('Este código já está cadastrado: Feijão.');
    expect(html).toContain('Salvando...');
  });

  it('shows the finish-the-edit notice inside the panel only after a scan', () => {
    expect(render()).not.toContain('Termine ou cancele a edição');
    expect(render({ scanWarning: true })).toContain('Termine ou cancele a edição antes de cadastrar um produto novo.');
  });

  it('ends with the Excluir produto area: help text and a red outline button that is not a submit', () => {
    const html = render();
    expect(html).toContain('Excluir produto</h3>');
    expect(html).toContain('O produto sai do caixa e da busca. O histórico de vendas fica guardado.');
    expect(html).toMatch(/<button[^>]*class="outline mg-danger"[^>]*>Excluir produto<\/button>/);
    expect(html.indexOf('Excluir produto</h3>')).toBeGreaterThan(html.indexOf('Código de Barras'));
    expect(html).not.toContain('role="alertdialog"');
  });

  it('asks to confirm: an alert dialog with the stock warning, Cancelar first, and no PIN for a product', () => {
    const html = render({ deleteFlow: { ...flow, asking: true } });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Excluir Arroz 5kg?');
    expect(html).toContain('Este produto tem 12 un. em estoque. Ele continua guardado, mas o produto some do caixa.');
    expect(html).not.toContain('PIN da proprietária');
    const from = html.indexOf('alertdialog');
    expect(html.indexOf('>Cancelar</button>', from)).toBeLessThan(html.indexOf('>Excluir</button>', from));
    expect(html).toMatch(/<button[^>]*class="primary mg-danger-fill"[^>]*>Excluir<\/button>/);
  });

  it('leaves the stock warning out with stock control off or no balance, and keeps the confirm button enabled', () => {
    expect(render({ stockControl: false, deleteFlow: { ...flow, asking: true } })).not.toContain('em estoque. Ele continua');
    expect(render({ target: { ...rice, availableQuantity: 0 }, deleteFlow: { ...flow, asking: true } })).not.toContain('em estoque. Ele continua');
    expect(render({ deleteFlow: { ...flow, asking: true } })).not.toMatch(/<button[^>]*disabled=""[^>]*>Excluir<\/button>/);
  });

  it('shows the delete error with a reload button inside the confirmation', () => {
    const html = render({ deleteFlow: { ...flow, asking: true, error: { text: 'Este produto foi alterado por outra pessoa.', reload: true } } });
    expect(html).toContain('Este produto foi alterado por outra pessoa.');
    expect(html).toContain('Recarregar a lista');
  });

  it('has a secondary Gerar código button beside the barcode, enabled while nothing else changed', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*class="outline"[^>]*type="button"[^>]*>Gerar código<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Gerar código<\/button>/);
  });

  it('disables Gerar código while saving or with other unsaved edits, and says to save first', () => {
    const base = draftFromProduct(rice);
    const disabled = /<button[^>]*disabled=""[^>]*>Gerar código<\/button>/;
    expect(render({ processing: true })).toMatch(disabled);
    const edited = render({ draft: { ...base, name: 'Arroz 1kg' } });
    expect(edited).toMatch(disabled);
    expect(edited).toContain('Salve as alterações antes de gerar um código.');
    expect(render()).not.toContain('Salve as alterações antes');
  });
});
