import { describe, it, expect } from 'vitest';
import type { ProductItem, ProductsSummary } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import {
  PRODUCTS_PAGE_SIZE,
  addToStock,
  applyPage,
  emptyList,
  needingRestockCount,
  removeProduct,
  replaceProduct,
  shownText,
  stockValueText,
} from './products-list';

const p = (id: string, availableQuantity = 10): ProductItem => ({ id, barcode: id, name: `Produto ${id}`, salePrice: 1, availableQuantity });
const ids = (items: ProductItem[]) => items.map((i) => i.id);

describe('applyPage', () => {
  it('page 1 replaces the list and keeps hasMore', () => {
    const before = { items: [p('old')], page: 3, hasMore: false };
    const after = applyPage(before, { token: 2, latestToken: 2, page: 1, items: [p('a'), p('b')], hasMore: true });
    expect(ids(after.items)).toEqual(['a', 'b']);
    expect(after).toMatchObject({ page: 1, hasMore: true });
  });

  it('the next page is appended in order', () => {
    const before = { items: [p('a'), p('b')], page: 1, hasMore: true };
    const after = applyPage(before, { token: 1, latestToken: 1, page: 2, items: [p('c')], hasMore: false });
    expect(ids(after.items)).toEqual(['a', 'b', 'c']);
    expect(after).toMatchObject({ page: 2, hasMore: false });
  });

  it('never repeats an item that is already in the list (dedupe by id)', () => {
    const before = { items: [p('a'), p('b')], page: 1, hasMore: true };
    const after = applyPage(before, { token: 1, latestToken: 1, page: 2, items: [p('b'), p('c'), p('c')], hasMore: true });
    expect(ids(after.items)).toEqual(['a', 'b', 'c']);
  });

  it('drops an old answer: the same state comes back when the token is not the latest', () => {
    const before = { items: [p('a')], page: 1, hasMore: true };
    const after = applyPage(before, { token: 1, latestToken: 2, page: 1, items: [p('stale')], hasMore: false });
    expect(after).toBe(before);
  });
});

describe('emptyList', () => {
  it('starts with no items, page 1 and nothing more to load', () => {
    expect(emptyList()).toEqual({ items: [], page: 1, hasMore: false });
  });
});

describe('addToStock', () => {
  it('adds the restocked quantity to that product only', () => {
    const after = addToStock([p('a', 1), p('b', 2)], 'b', 5);
    expect(after.map((i) => i.availableQuantity)).toEqual([1, 7]);
  });
});

describe('shownText', () => {
  it('says how many are shown of the real total', () => {
    expect(shownText(50, 1200)).toBe('Mostrando 50 de 1200 produtos');
  });
  it('without the total, only says how many are shown', () => {
    expect(shownText(50, null)).toBe('Mostrando 50 produtos');
  });
  it('uses the singular for one product', () => {
    expect(shownText(1, 1)).toBe('Mostrando 1 de 1 produto');
  });
});

describe('summary numbers', () => {
  const summary = (over: Partial<ProductsSummary>): ProductsSummary => ({ total: 7, lowStockCount: 2, outOfStockCount: 3, stockValue: '1234.50', ...over });

  it('needing restock is low plus out of stock', () => {
    expect(needingRestockCount(summary({}))).toBe(5);
  });
  it('is unavailable (null) without a summary or with the stock fields null', () => {
    expect(needingRestockCount(null)).toBeNull();
    expect(needingRestockCount(summary({ lowStockCount: null, outOfStockCount: null }))).toBeNull();
  });
  it('shows the stock value as money from the decimal string, and a dash when unavailable', () => {
    expect(stockValueText(summary({}))).toBe(formatMoney('1234.50'));
    expect(stockValueText(summary({}))).toMatch(/1.234,50$/);
    expect(stockValueText(null)).toBe('—');
    expect(stockValueText(summary({ stockValue: null }))).toBe('—');
  });
});

describe('replaceProduct', () => {
  it('swaps only the item with that id, keeping order and size', () => {
    const items = [p('a'), p('b'), p('c')];
    const out = replaceProduct(items, { ...p('b'), name: 'Novo' });
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out[1].name).toBe('Novo');
    expect(out[0]).toBe(items[0]);
  });
});

describe('removeProduct', () => {
  it('drops only the item with that id', () => {
    const items = [p('a'), p('b'), p('c')];
    expect(ids(removeProduct(items, 'b'))).toEqual(['a', 'c']);
    expect(ids(removeProduct(items, 'zz'))).toEqual(['a', 'b', 'c']);
  });
});

describe('page size', () => {
  it('asks for 50 products at a time', () => {
    expect(PRODUCTS_PAGE_SIZE).toBe(50);
  });
});
