import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NewProductPanel } from './new-product-panel';

const noop = () => {};
function render(over: Partial<React.ComponentProps<typeof NewProductPanel>> = {}) {
  return renderToStaticMarkup(
    <NewProductPanel
      barcode=""
      name=""
      unit="UN"
      price=""
      stock="0"
      stockControl={false}
      processing={false}
      barcodeNote={null}
      scanWarning={false}
      error={null}
      nameRef={{ current: null }}
      onBarcode={noop}
      onName={noop}
      onUnit={noop}
      onPrice={noop}
      onStock={noop}
      onSubmit={noop}
      closing={false}
      onClosed={noop}
      onCancel={noop}
      onBarcodeBlur={noop}
      onBarcodeKeyDown={noop}
      {...over}
    />
  );
}

describe('NewProductPanel', () => {
  it('while closing it is marked data-closing and inert (no second save during the exit), and not marked otherwise', () => {
    expect(render()).not.toMatch(/<dialog[^>]*(data-closing|inert)/);
    expect(render({ closing: true })).toMatch(/<dialog[^>]*data-closing="true"[^>]*inert=""|<dialog[^>]*inert=""[^>]*data-closing="true"/);
  });

  it('is a modal dialog named by its title, closed by a button labelled Fechar', () => {
    const html = render();
    const labelledBy = html.match(/<dialog[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`<h2 id="${labelledBy}"[^>]*>Novo produto</h2>`));
    expect(html).toContain('class="mg-panel"');
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toMatch(/<button[^>]*aria-label="Fechar"[^>]*>×<\/button>/);
  });

  it('keeps every field of the old form, each label tied to its input', () => {
    const html = render();
    expect(html).toMatch(/Código de Barras[\s\S]*Nome do Produto[\s\S]*Como é vendido[\s\S]*Preço de Venda \(R\$\)/);
    for (const field of ['barcode', 'name', 'unit', 'price']) {
      expect(html).toContain(`for="np-${field}"`);
      expect(html).toContain(`id="np-${field}"`);
    }
    expect(html).toContain('placeholder="Deixe em branco para gerar"');
    expect(html).not.toMatch(/<input[^>]*id="np-barcode"[^>]*required/);
    expect(html).not.toMatch(/<input[^>]*required[^>]*id="np-barcode"/);
    expect(html).toContain('Por unidade');
    expect(html).toContain('Por peso (preço por quilo)');
    expect(html).toContain('placeholder="24,90"');
  });

  it('asks for the initial stock only when the stock control is on, and labels by unit', () => {
    expect(render()).not.toContain('np-stock');
    expect(render({ stockControl: true })).toContain('Estoque Inicial</label>');
    const kg = render({ stockControl: true, unit: 'KG' });
    expect(kg).toContain('Estoque Inicial (kg)');
    expect(kg).toContain('Preço por Quilo (R$)');
  });

  it('shows the taken barcode note inside the panel', () => {
    const html = render({ barcodeNote: 'Este código já está cadastrado: Feijão.' });
    expect(html).toContain('Este código já está cadastrado: Feijão.');
    expect(html).toContain('role="alert"');
    expect(render()).not.toContain('já está cadastrado');
  });

  it('has Cancelar (not a submit) and Salvar Produto (the submit) in the footer', () => {
    const html = render();
    expect(html).toMatch(/<div class="mg-panel-foot">[\s\S]*<button[^>]*class="outline"[^>]*type="button"[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<div class="mg-panel-foot">[\s\S]*<button[^>]*class="primary"[^>]*type="submit"[^>]*>Salvar Produto<\/button>/);
    expect(render({ processing: true })).toContain('Salvando...');
    expect(render({ processing: true })).toMatch(/<button[^>]*disabled=""[^>]*>Salvando\.\.\.<\/button>/);
  });

  it('shows the scan notice and the error inside the panel only when they happen', () => {
    expect(render()).not.toContain('bipar outro produto');
    expect(render({ scanWarning: true })).toContain('Termine ou cancele o cadastro antes de bipar outro produto.');
    expect(render()).not.toContain('class="error"');
    const withError = render({ error: 'Erro ao cadastrar produto.' });
    expect(withError).toContain('Erro ao cadastrar produto.');
    expect(withError).toContain('role="alert"');
  });
});

describe('NewProductPanel barcode warnings (D-30)', () => {
  const INVALID = 'Código de barras inválido. Use um código de barras de verdade ou deixe em branco para gerar um.';
  const HINT = 'Corrija o código de barras, ou deixe em branco, para salvar.';
  const saveDisabled = (html: string) => /<button[^>]*type="submit"[^>]*disabled=""/.test(html);

  it('empty: neutral help that a code will be generated, the new placeholder, Salvar enabled', () => {
    const html = render();
    expect(html).toContain('Deixe em branco e o sistema gera um código para este produto.');
    expect(html).toContain('placeholder="Deixe em branco para gerar"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain(HINT);
    expect(saveDisabled(html)).toBe(false);
  });

  it('on the sales screen the empty help tells to scan or type, with no placeholder', () => {
    const html = render({ forSale: true });
    expect(html).toContain('Bipe o produto ou digite o código. Em branco, o sistema gera um.');
    expect(html).not.toContain('Deixe em branco para gerar');
  });

  it('digits below 8: neutral warning with the length, not an alert, Salvar disabled (the server would refuse it)', () => {
    const html = render({ barcode: '123' });
    expect(html).toContain('Um código de barras tem 8, 12, 13 ou 14 números. Você digitou 3.');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(saveDisabled(html)).toBe(true);
  });

  it.each(['abc123', '7891000100104', '123456789'])('invalid %s: red alert, aria-invalid, Salvar disabled with the hint', (barcode) => {
    const html = render({ barcode });
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${INVALID}<`));
    expect(html).toMatch(/<input[^>]*id="np-barcode"[^>]*aria-invalid="true"/);
    expect(html).toContain(HINT);
    expect(saveDisabled(html)).toBe(true);
  });

  it('valid: green status badge with the type, Salvar enabled', () => {
    const html = render({ barcode: '7891000100103' });
    expect(html).toMatch(/role="status"[^>]*>Código válido \(EAN-13\)</);
    expect(html).not.toContain('aria-invalid="true"');
    expect(saveDisabled(html)).toBe(false);
  });

  it('ties the field to the message with aria-describedby', () => {
    for (const barcode of ['', '123', 'abc', '7891000100103']) {
      const html = render({ barcode });
      const id = html.match(/<input[^>]*id="np-barcode"[^>]*aria-describedby="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('keeps the taken-code note beside the format warning', () => {
    const html = render({ barcode: '7891000100103', barcodeNote: 'Este código já está cadastrado: Arroz.' });
    expect(html).toContain('Este código já está cadastrado: Arroz.');
  });
});
