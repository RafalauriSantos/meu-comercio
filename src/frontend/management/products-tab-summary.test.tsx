import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser, ProductsSummary } from '@/frontend/lib/api-client';
import { ProductsTab } from './products-tab';
import type { useProductsTab } from './use-products-tab';

const noop = () => {};
const summary: ProductsSummary = { total: 199, lowStockCount: 3, outOfStockCount: 2, stockValue: '1500.00' };

function render({ stockControl, owner, withSummary = true, showNew = false, showImport = false }: { stockControl: boolean; owner: boolean; withSummary?: boolean; showNew?: boolean; showImport?: boolean }) {
  const tab = {
    showNewProduct: showNew,
    showImport,
    newBarcode: '789',
    newName: '',
    newPrice: '',
    newStock: '0',
    newScanWarning: false,
    createError: null,
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
  it('is one strip with the total and the stock numbers, not two cards, and has no stock switch (it lives in Ajustes)', () => {
    const html = render({ stockControl: false, owner: true });
    expect(html.match(/class="mg-summary"/g)).toHaveLength(1);
    expect(html).not.toContain('mg-kpis');
    expect(html).not.toContain('mg-stock-switch');
    expect(html).toContain('mg-summary-total');
    expect(html).toContain('199');
    expect(html).toContain('produtos cadastrados');
    expect(html).not.toContain('Controle de estoque');
    expect(html).not.toMatch(/>(Ligar|Desligar)<\/button>/);
  });

  it('shows a dash when the summary is unavailable', () => {
    expect(render({ stockControl: false, owner: true, withSummary: false })).toMatch(/mg-summary-total[^>]*>—</);
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

  it('opens clean: the import card is hidden and the button says it is collapsed', () => {
    const html = render({ stockControl: true, owner: true });
    expect(html).not.toContain('Importar produtos de uma planilha');
    expect(html).toMatch(/class="outline mg-toolbar-import"[^>]*aria-expanded="false"/);
  });

  it('shows the import card, with Fechar, once the button is on', () => {
    const html = render({ stockControl: true, owner: true, showImport: true });
    expect(html).toContain('Importar produtos de uma planilha');
    expect(html).toContain('aria-label="Fechar a importação"');
    expect(html).toMatch(/class="outline mg-toolbar-import"[^>]*aria-expanded="true"/);
  });

  it('does not show Import to who is not the owner', () => {
    expect(render({ stockControl: false, owner: false })).not.toContain('Importar planilha');
  });

  it('has Exportar planilha after Importar planilha, for the owner only', () => {
    const html = render({ stockControl: false, owner: true });
    expect(html.indexOf('Exportar planilha')).toBeGreaterThan(html.indexOf('Importar planilha'));
    expect(html).not.toContain('role="alert"');
    expect(render({ stockControl: false, owner: false })).not.toContain('Exportar planilha');
  });

  it('keeps the New product button as is while the panel is open (it does not turn into Cancelar)', () => {
    const html = render({ stockControl: false, owner: true, showNew: true });
    expect(html).toMatch(/class="primary mg-toolbar-new"[^>]*>＋ Novo Produto/);
    expect(html).not.toMatch(/mg-toolbar-new"[^>]*>Cancelar/);
  });
});

describe('new product panel in the tab', () => {
  it('is not on the page until the button opens it', () => {
    const html = render({ stockControl: false, owner: true });
    expect(html).not.toContain('<dialog');
    expect(html).not.toContain('np-barcode');
  });

  it('opens as a side panel with the code filled in, and the stock field follows the stock control', () => {
    const off = render({ stockControl: false, owner: true, showNew: true });
    expect(off).toContain('<dialog');
    expect(off).toContain('value="789"');
    expect(off).toContain('Salvar Produto');
    expect(off).not.toContain('np-stock');
    expect(render({ stockControl: true, owner: true, showNew: true })).toContain('np-stock');
  });
});
