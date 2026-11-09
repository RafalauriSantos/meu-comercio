import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductItem } from '@/frontend/lib/api-client';
import { SearchResults } from '@/frontend/pdv/search-results';
import { WeightPrompt } from '@/frontend/pdv/weight-prompt';
import { ImportProductsPanel } from './import-products-panel';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const cheese: ProductItem = { id: 'q', barcode: '9', name: 'Queijo Mussarela', salePrice: 42.9, availableQuantity: 2500, unit: 'KG' };
const rice: ProductItem = { id: 'a', barcode: '1', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 12 };

describe('the PDV when the shop does not control its stock', () => {
  it('the search shows only the price, no balance', () => {
    const off = renderToStaticMarkup(<SearchResults results={[rice, cheese]} highlighted={0} onPick={() => {}} showStock={false} />);
    const on = renderToStaticMarkup(<SearchResults results={[rice, cheese]} highlighted={0} onPick={() => {}} />);

    expect(off).toContain('Arroz 5kg');
    expect(off).not.toMatch(/12 un|2,5 kg/);
    expect(on).toMatch(/12\s*un/);
    expect(on).toContain('2,5 kg');
  });

  it('the weight window does not show the balance and does not limit the weight by it', () => {
    const off = renderToStaticMarkup(<WeightPrompt product={cheese} stockControl={false} onConfirm={() => {}} onCancel={() => {}} />);
    const on = renderToStaticMarkup(<WeightPrompt product={cheese} stockControl onConfirm={() => {}} onCancel={() => {}} />);

    expect(off).toContain('por kg');
    expect(off).not.toContain('em estoque');
    expect(on).toContain('em estoque: 2,5 kg');
  });

  it('asks the settings of the shop when it opens, and falls back to "controls the stock" if they do not arrive', () => {
    const pdv = read('src', 'app', 'pdv', 'page.tsx');

    expect(pdv).toContain("apiClient.getStoreSettings().catch(() => ({ stockControlEnabled: true }))");
    expect(pdv).toContain('showStock={stockControl}');
    expect(pdv).toContain('stockControl={stockControl}');
  });
});

describe('the management panel when the shop does not control its stock', () => {
  const page = read('src', 'app', 'gestao', 'page.tsx');

  it('hides what is about stock: the indicators, the filters, the balance, the entry and the tags', () => {
    expect(page).toMatch(/\{stockControl && \(\s*<>\s*<div className="mg-kpi mg-kpi-warn">/);
    expect(page).toMatch(/\{stockControl && \(\s*<div role="group" aria-label="Filtro de estoque"/);
    expect(page).toContain('{stockControl && <th scope="col" className="mg-num">Em estoque</th>}');
    expect(page).toContain('{stockControl && <th scope="col" className="mg-num">Ação</th>}');
    expect(page).toContain("{stockControl && status === 'low'");
    expect(page).toContain("{stockControl && status === 'out'");
    expect(page).toContain('{stockControl && restockingId === p.id && (');
    expect(page).toContain('colSpan={stockControl ? 4 : 2}');
  });

  it('does not ask for the initial stock of a new product', () => {
    expect(page).toMatch(/\{stockControl && \(\s*<div>\s*<label className="field-label" htmlFor="np-stock">/);
  });

  it('shows every product, whatever the stock filter said before', () => {
    expect(page).toContain('(p) => !stockControl || matchesStockFilter(');
  });

  it('has the switch for the owner only, and asks before changing it', () => {
    expect(page).toMatch(/\{user\?\.isOwner && \(\s*<section className="card mg-stock-switch"/);
    expect(page).toContain('if (!confirm(question)) return;');
    expect(page).toContain('apiClient.updateStoreSettings({ stockControlEnabled: !stockControl })');
  });

  it('warns, when turning it on again, that the balances may be out of date', () => {
    expect(page).toContain('podem estar desatualizados');
    expect(page).toContain('As vendas feitas com o controle desligado não baixaram nada');
  });

  it('loads the settings with the rest, and keeps the old behavior if they do not arrive', () => {
    expect(page).toContain('.getStoreSettings()');
    expect(page).toContain('.catch(() => undefined)');
  });
});

describe('the import panel', () => {
  it('says the Estoque column is ignored when the stock is not controlled, and does not show it in the preview', () => {
    const off = renderToStaticMarkup(<ImportProductsPanel stockControl={false} onImported={() => {}} />);
    const on = renderToStaticMarkup(<ImportProductsPanel stockControl onImported={() => {}} />);

    expect(off).toContain('controle de estoque está desligado');
    expect(on).not.toContain('controle de estoque está desligado');
    expect(on).toContain('preço, estoque e');
  });
});
