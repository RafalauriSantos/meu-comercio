import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductItem } from '@/frontend/lib/api-client';
import { draftFromProduct } from './product-edit';
import { ProductEditRow } from './product-edit-row';

const rice: ProductItem = { id: 'a', barcode: '789', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 12, updatedAt: '2026-11-16T10:00:00.000Z' };
const cheese: ProductItem = { id: 'q', barcode: '9', name: 'Queijo', salePrice: 42.9, availableQuantity: 2500, unit: 'KG' };

const noop = () => {};
function render(over: Partial<React.ComponentProps<typeof ProductEditRow>> = {}) {
  const target = over.target ?? rice;
  return renderToStaticMarkup(
    <table>
      <tbody>
        <ProductEditRow
          target={target}
          draft={draftFromProduct(target)}
          colSpan={4}
          processing={false}
          barcodeNote={null}
          error={null}
          nameRef={{ current: null }}
          onDraft={noop}
          onSubmit={noop}
          onCancel={noop}
          onReload={noop}
          onBarcodeBlur={noop}
          onBarcodeKeyDown={noop}
          {...over}
        />
      </tbody>
    </table>
  );
}

describe('ProductEditRow', () => {
  it('shows the price masked, with Salvar disabled while nothing changed and no warnings', () => {
    const html = render();
    expect(html).toContain('value="25,50"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Salvar<\/button>/);
    expect(html).not.toContain('etiquetas');
    expect(html).not.toContain('sem internet');
    expect(html).toContain('colSpan="4"');
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
});
