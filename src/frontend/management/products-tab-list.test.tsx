import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser, ProductItem, ProductsSummary } from '@/frontend/lib/api-client';
import { draftFromProduct } from './product-edit';
import { ProductsTab } from './products-tab';
import type { useProductsTab } from './use-products-tab';

const noop = () => {};
const summary: ProductsSummary = { total: 199, lowStockCount: 3, outOfStockCount: 2, stockValue: '1500.00' };
const rice: ProductItem = { id: 'a', barcode: '789', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 12 };
const beans: ProductItem = { id: 'b', barcode: '790', name: 'Feijão', salePrice: 8, availableQuantity: 0 };
const cheese: ProductItem = { id: 'q', barcode: '9', name: 'Queijo', salePrice: 42.9, availableQuantity: 2500, unit: 'KG' };

function render({
  stockControl = false,
  owner = true,
  products = [rice, beans, cheese],
  hasMore = false,
  restockingId = null,
  editing = null,
}: {
  stockControl?: boolean;
  owner?: boolean;
  products?: ProductItem[];
  hasMore?: boolean;
  restockingId?: string | null;
  editing?: ProductItem | null;
} = {}) {
  const tab = {
    products,
    hasMore,
    summary,
    stockFilter: 'all',
    productQuery: '',
    barcodeNote: null,
    newUnit: 'UN',
    restockingId,
    restockQty: '',
    restockReason: '',
    edit: {
      close: noop,
      targetId: editing?.id ?? null,
      target: editing,
      draft: editing ? draftFromProduct(editing) : null,
      error: null,
      barcodeNote: null,
    },
  } as unknown as ReturnType<typeof useProductsTab>;
  return renderToStaticMarkup(
    <ProductsTab
      tab={tab}
      stockControl={stockControl}
      user={{ isOwner: owner } as AuthUser}
      setFeedback={noop}
      loadFailed={{}}
      retrying={false}
      processing={false}
      retry={async () => {}}
    />
  );
}

const count = (html: string, part: string) => html.split(part).length - 1;

describe('catalog dense list', () => {
  it('is a list with grid semantics, not a table', () => {
    const html = render();
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<tr');
    expect(html).toContain('role="table"');
    expect(html).toContain('aria-label="Produtos"');
    expect(html).toContain('class="mg-list"');
    expect(count(html, 'role="columnheader"')).toBe(3);
  });

  it('has the header Produto, Preço and an action column with a hidden name', () => {
    const html = render();
    const start = html.indexOf('mg-list-head');
    expect(start).toBeGreaterThan(-1);
    const head = html.slice(start, html.indexOf('role="rowgroup"', start));
    expect(head).toMatch(/Produto[\s\S]*Preço[\s\S]*<span class="sr-only">Ação<\/span>/);
    expect(head).not.toContain('Em estoque');
    expect(head).not.toContain('Entrada');
  });

  it('draws the name in bold with the small gray code under it, and the price on the right', () => {
    const html = render();
    expect(html).toContain('<strong>Arroz 5kg</strong>');
    expect(html).toMatch(/<div class="muted mg-barcode num">789<\/div>/);
    expect(html).toMatch(/role="cell" class="mg-num">R\$\s?25,50<\/div>/);
    expect(html).toMatch(/role="cell" class="mg-num">R\$\s?42,90 \/kg<\/div>/);
  });

  it('puts Editar in its own cell, after the price, for the owner only', () => {
    const owner = render();
    expect(count(owner, 'aria-label="Editar ')).toBe(3);
    expect(owner).toMatch(/class="mg-num">R\$\s?25,50<\/div><div role="cell" class="mg-row-end"><button type="button" class="outline mg-row-action"[^>]*aria-label="Editar Arroz 5kg"/);
    // Editar is no longer inside the product cell.
    expect(owner).not.toMatch(/mg-barcode num">789<\/div><button/);

    const other = render({ owner: false });
    expect(other).not.toContain('Editar');
    expect(count(other, 'role="row"')).toBe(1 + 3);
  });

  it('shows no stock columns, tags or Entrada when the stock control is off', () => {
    const html = render();
    expect(html).not.toContain('Em estoque');
    expect(html).not.toContain('Entrada');
    expect(html).not.toContain('Estoque baixo</span>');
    expect(html).not.toContain('Sem estoque</span>');
    expect(html).not.toContain('mg-list-stock');
  });

  it('with the stock control on keeps Em estoque, Entrada, tags and the order Produto, Em estoque, Entrada, Preço, action', () => {
    const html = render({ stockControl: true });
    expect(html).toContain('mg-list mg-list-stock');
    expect(count(html, 'role="columnheader"')).toBe(5);
    expect(html).toMatch(/Produto[\s\S]*Em estoque[\s\S]*>Entrada<[\s\S]*Preço[\s\S]*<span class="sr-only">Ação<\/span>/);
    expect(html).toContain('mg-stock mg-stock-out');
    expect(html).toContain('<span class="mg-tag mg-tag-danger">Sem estoque</span>');
    expect(html).toContain('2,5 kg');
    expect(html).toContain('aria-label="Registrar entrada de estoque de Arroz 5kg"');
    expect(count(html, 'aria-label="Editar ')).toBe(3);
  });

  it('opens the restock row under its product as a full-width row', () => {
    const html = render({ stockControl: true, restockingId: 'a' });
    expect(html).toMatch(/<div role="row" class="mg-restock-row"><div role="cell" class="mg-row-full"><form[^>]*class="mg-restock"/);
    expect(html).toContain('Confirmar Reposição');
    expect(html).toContain('aria-label="Fechar entrada de estoque de Arroz 5kg"');
    expect(render({ stockControl: false, restockingId: 'a' })).not.toContain('Confirmar Reposição');
  });

  it('opens the inline edit as a full-width row under the product, for the owner only', () => {
    const html = render({ editing: rice });
    expect(html).toMatch(/<div role="row" class="mg-restock-row"><div role="cell" class="mg-row-full"><form/);
    expect(html).toContain('id="edit-name-a"');
    expect(html).toContain('aria-expanded="true"');
    expect(render({ editing: rice, owner: false })).not.toContain('edit-name-a');
  });

  it('shows the empty message in a full-width row', () => {
    expect(render({ products: [] })).toMatch(/<div role="row"><div role="cell" class="mg-row-full mg-empty-cell">Nenhum produto cadastrado com os critérios pesquisados\.<\/div>/);
  });

  it('keeps the footer: Mostrando X de N and Carregar mais only when there is more', () => {
    const more = render({ hasMore: true });
    expect(more).toContain('Mostrando 3 de 199 produtos');
    expect(more).toContain('>Carregar mais</button>');
    expect(render()).not.toContain('Carregar mais');
    expect(render({ stockControl: true })).toContain('Entrada registra compra ou reposição de estoque');
  });
});
