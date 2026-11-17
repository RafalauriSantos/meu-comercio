import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser, ProductsSummary } from '@/frontend/lib/api-client';
import { ProductsTab } from './products-tab';
import type { useProductsTab } from './use-products-tab';

const noop = () => {};
const summary: ProductsSummary = { total: 199, lowStockCount: 3, outOfStockCount: 2, stockValue: '1500.00' };

function render({ stockControl, owner, withSummary = true }: { stockControl: boolean; owner: boolean; withSummary?: boolean }) {
  const tab = {
    products: [],
    hasMore: false,
    summary: withSummary ? summary : null,
    stockFilter: 'all',
    productQuery: '',
    barcodeNote: null,
    newUnit: 'UN',
    edit: { close: noop, targetId: null, target: null },
  } as unknown as ReturnType<typeof useProductsTab>;
  const user = { isOwner: owner } as AuthUser;
  return renderToStaticMarkup(
    <ProductsTab
      tab={tab}
      stockControl={stockControl}
      user={user}
      setFeedback={noop}
      loadFailed={{}}
      retrying={false}
      processing={false}
      retry={async () => {}}
    />
  );
}

describe('catalog summary strip', () => {
  it('is one strip with the total, the stock state and the owner button, not two cards', () => {
    const html = render({ stockControl: false, owner: true });
    expect(html.match(/class="mg-summary"/g)).toHaveLength(1);
    expect(html).not.toContain('mg-kpis');
    expect(html).not.toContain('mg-stock-switch');
    expect(html).toContain('mg-summary-total');
    expect(html).toContain('199');
    expect(html).toContain('produtos cadastrados');
    expect(html).toContain('Controle de estoque: <strong>desligado</strong>');
    expect(html).toContain('>Ligar</button>');
  });

  it('shows a dash when the summary is unavailable', () => {
    expect(render({ stockControl: false, owner: true, withSummary: false })).toMatch(/mg-summary-total[^>]*>—</);
  });

  it('has the stock button for the owner only', () => {
    expect(render({ stockControl: false, owner: false })).not.toMatch(/>(Ligar|Desligar)<\/button>/);
    expect(render({ stockControl: true, owner: false })).not.toMatch(/>(Ligar|Desligar)<\/button>/);
    expect(render({ stockControl: true, owner: true })).toContain('>Desligar</button>');
  });

  it('shows the restock and stock value numbers only when the stock control is on', () => {
    const off = render({ stockControl: false, owner: true });
    expect(off).not.toContain('Precisam de reposição');
    expect(off).not.toContain('Valor em estoque');
    expect(off).not.toContain('Em estoque');
    const on = render({ stockControl: true, owner: true });
    expect(on).toContain('Precisam de reposição');
    expect(on).toMatch(/<strong class="num">5<\/strong>/);
    expect(on).toContain('Valor em estoque (a preço de venda)');
    expect(on).toContain('R$');
    expect(on).toContain('Controle de estoque: <strong>ligado</strong>');
  });
});

describe('catalog toolbar', () => {
  it('has the search, then New product highlighted, then Import quieter', () => {
    const html = render({ stockControl: false, owner: true });
    const search = html.indexOf('id="product-search"');
    const novo = html.indexOf('Novo Produto');
    const imp = html.indexOf('Importar planilha');
    expect(search).toBeGreaterThan(-1);
    expect(novo).toBeGreaterThan(search);
    expect(imp).toBeGreaterThan(novo);
    expect(html).toMatch(/class="primary mg-toolbar-new"[^>]*>＋ Novo Produto/);
    expect(html).toMatch(/class="outline mg-toolbar-import"[^>]*>Importar planilha/);
    expect(html).toContain('mg-search-wide');
  });

  it('does not show Import to who is not the owner', () => {
    expect(render({ stockControl: false, owner: false })).not.toContain('Importar planilha');
  });
});
