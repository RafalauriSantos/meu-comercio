'use client';

import { useState, useRef } from 'react';
import { apiClient, loadErrorMessage } from '@/frontend/lib/api-client';
import { STATEMENT_PAGE_SIZE, mergeStatementItems, type StatementItem } from '@/frontend/management/customer-statement';

/** State and actions of the statement of one customer. Called by useCustomersTab. An expired session is handled by the api client. */
export function useCustomerStatement() {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  // The panel plays its exit while closing; it calls finishClose at the end, and only then the target is dropped.
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<StatementItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Each customer opened takes a new token: an answer that comes back with an older one is dropped.
  const token = useRef(0);
  const busy = useRef(false);

  // The first page (items empty) or the next one. A failure keeps what is shown and offers to try again.
  async function load(customerId: string, cursor?: string) {
    if (busy.current) return;
    busy.current = true;
    const mine = token.current;
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.getCustomerStatement(customerId, STATEMENT_PAGE_SIZE, cursor);
      if (mine !== token.current) return;
      setItems((cur) => mergeStatementItems(cur, page.items));
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (mine === token.current) setError(loadErrorMessage(err));
    } finally {
      if (mine === token.current) {
        setLoading(false);
        busy.current = false;
      }
    }
  }

  function open(customer: { id: string; name: string }) {
    token.current += 1;
    busy.current = false;
    setClosing(false);
    setTarget({ id: customer.id, name: customer.name });
    setItems([]);
    setNextCursor(null);
    void load(customer.id);
  }

  function close() {
    setClosing(true);
  }

  function finishClose() {
    token.current += 1;
    busy.current = false;
    setTarget(null);
    setClosing(false);
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(false);
  }

  function loadMore() {
    if (target && nextCursor) void load(target.id, nextCursor);
  }

  // Before the first page arrives there is no cursor: try the first page again.
  function retry() {
    if (target) void load(target.id, nextCursor ?? undefined);
  }

  return { target, closing, items, nextCursor, loading, error, closeRef, open, close, finishClose, loadMore, retry };
}
