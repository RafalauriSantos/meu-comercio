'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient, ProductsSummary, type ProductItem } from '@/frontend/lib/api-client';
import { PRODUCTS_PAGE_SIZE, addToStock, applyPage, emptyList, removeProduct, replaceProduct } from '@/frontend/management/products-list';

interface UseProductsListParams {
  setLoadFailed: (update: (f: { products?: boolean }) => { products?: boolean }) => void;
}

/** The paged list of products (50 at a time), its summary (the real numbers over all products) and their loads. */
export function useProductsList({ setLoadFailed }: UseProductsListParams) {
  const [list, setList] = useState(emptyList);
  // Over all active products. Null while it is not loaded or when the last read failed: the screen shows a dash.
  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  // Each new page 1 (search, reload) takes a new token: an answer that comes back with an older one is dropped.
  const token = useRef(0);
  const firstPagePending = useRef(false);
  const query = useRef('');
  const summaryToken = useRef(0);

  const loadSummary = useCallback(async () => {
    const mine = ++summaryToken.current;
    try {
      const res = await apiClient.getProductsSummary();
      if (mine === summaryToken.current) setSummary(res);
    } catch (err) {
      if (mine === summaryToken.current) setSummary(null);
      console.error('Erro ao carregar o resumo dos produtos:', err);
    }
  }, []);

  // Page 1 of the search (empty: the whole list). Without a search it also reads the summary.
  const loadProducts = useCallback(async (search = '') => {
    const mine = ++token.current;
    query.current = search;
    firstPagePending.current = true;
    setLoadMoreFailed(false);
    try {
      const request = apiClient.listProducts(search, 1, PRODUCTS_PAGE_SIZE);
      if (!search) void loadSummary();
      const res = await request;
      setList((cur) => applyPage(cur, { token: mine, latestToken: token.current, page: 1, items: res.items || [], hasMore: res.hasMore === true }));
      if (mine === token.current) {
        firstPagePending.current = false;
        setLoadFailed((f) => ({ ...f, products: false }));
      }
    } catch (err) {
      if (mine === token.current) {
        firstPagePending.current = false;
        setLoadFailed((f) => ({ ...f, products: true }));
      }
      console.error('Erro ao carregar produtos:', err);
    }
  }, [setLoadFailed, loadSummary]);

  // Appends the next page. A failure keeps what is loaded and only flags the button to try again.
  async function loadMore() {
    if (loadingMore || firstPagePending.current || !list.hasMore) return;
    const mine = token.current;
    const page = list.page + 1;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const res = await apiClient.listProducts(query.current, page, PRODUCTS_PAGE_SIZE);
      setList((cur) => applyPage(cur, { token: mine, latestToken: token.current, page, items: res.items || [], hasMore: res.hasMore === true }));
    } catch (err) {
      if (mine === token.current) setLoadMoreFailed(true);
      console.error('Erro ao carregar mais produtos:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  // A restock adds to the saldo of a product on screen: the loaded pages stay, and the summary is read again.
  function applyRestock(productId: string, quantity: number) {
    setList((cur) => ({ ...cur, items: addToStock(cur.items, productId, quantity) }));
    void loadSummary();
  }

  // A saved edit swaps the item for the one the server answered with; the stock value depends on the price, so the summary is read again.
  function applyEdit(item: ProductItem) {
    setList((cur) => ({ ...cur, items: replaceProduct(cur.items, item) }));
    void loadSummary();
  }

  // An excluded product leaves the loaded pages; the summary only counts active products, so it is read again.
  function applyDeleted(productId: string) {
    setList((cur) => ({ ...cur, items: removeProduct(cur.items, productId) }));
    void loadSummary();
  }

  return { products: list.items, hasMore: list.hasMore, summary, loadingMore, loadMoreFailed, loadProducts, loadMore, applyRestock, applyEdit, applyDeleted };
}
