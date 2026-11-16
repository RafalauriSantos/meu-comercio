import type { ProductItem, ProductsSummary } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';

// Pure rules of the paged products list (the hook only holds the state and calls the API).
export const PRODUCTS_PAGE_SIZE = 50;

export interface ProductsList {
  items: ProductItem[];
  page: number;
  hasMore: boolean;
}

export function emptyList(): ProductsList {
  return { items: [], page: 1, hasMore: false };
}

interface PageAnswer {
  /** The token this request was started with, and the latest one: an older answer is dropped. */
  token: number;
  latestToken: number;
  page: number;
  items: ProductItem[];
  hasMore: boolean;
}

/** Page 1 replaces the list, the next pages are appended without repeating an id. An old answer changes nothing. */
export function applyPage(list: ProductsList, answer: PageAnswer): ProductsList {
  if (answer.token !== answer.latestToken) return list;
  const base = answer.page === 1 ? [] : list.items;
  const seen = new Set(base.map((p) => p.id));
  const items = [...base];
  for (const p of answer.items) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    items.push(p);
  }
  return { items, page: answer.page, hasMore: answer.hasMore };
}

/** A restock adds to the saldo of one product already on screen, so the loaded pages stay where they are. */
export function addToStock(items: ProductItem[], productId: string, quantity: number): ProductItem[] {
  return items.map((p) => (p.id === productId ? { ...p, availableQuantity: p.availableQuantity + quantity } : p));
}

export function shownText(shown: number, total: number | null): string {
  const noun = (total ?? shown) === 1 ? 'produto' : 'produtos';
  return total === null ? `Mostrando ${shown} ${noun}` : `Mostrando ${shown} de ${total} ${noun}`;
}

/** Low plus out of stock, over all products. Null when the summary is unavailable or stock control is off. */
export function needingRestockCount(summary: ProductsSummary | null): number | null {
  if (!summary || summary.lowStockCount === null || summary.outOfStockCount === null) return null;
  return summary.lowStockCount + summary.outOfStockCount;
}

export function stockValueText(summary: ProductsSummary | null): string {
  return summary?.stockValue == null ? '—' : formatMoney(summary.stockValue);
}
