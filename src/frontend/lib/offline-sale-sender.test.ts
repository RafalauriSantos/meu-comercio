import { describe, it, expect, beforeEach } from 'vitest';
import { ApiError } from './api-client';
import { OfflineSyncManager, OfflineSale } from './offline-sync';
import { settleOfflineSale } from './offline-sale-sender';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const MERCHANT = 'merchant-1';
const OPERATOR = 'caixa-1';

function offlineSale(key: string): OfflineSale {
  return {
    idempotencyKey: key,
    merchantId: MERCHANT,
    operatorId: OPERATOR,
    items: [{ productId: 'p-1', quantity: 1 }],
    payments: [{ method: 'CASH', amount: '10.00' }],
    createdAt: new Date().toISOString(),
  };
}

describe('settleOfflineSale with the offline queue', () => {
  let manager: OfflineSyncManager;

  beforeEach(() => {
    manager = new OfflineSyncManager(new MemoryStorage());
    manager.enqueueSale(MERCHANT, OPERATOR, offlineSale('first'));
    manager.enqueueSale(MERCHANT, OPERATOR, offlineSale('second'));
  });

  function sync(createSale: (sale: OfflineSale) => Promise<unknown>) {
    return manager.syncQueue(MERCHANT, OPERATOR, (sale) => settleOfflineSale(() => createSale(sale)));
  }

  it('removes sales the server accepted', async () => {
    const result = await sync(async () => ({ id: 'sale' }));

    expect(result.syncedCount).toBe(2);
    expect(manager.getQueue(MERCHANT, OPERATOR)).toHaveLength(0);
  });

  it('treats an already recorded sale as synced and keeps sending the rest of the queue', async () => {
    const sent: string[] = [];
    const result = await sync(async (sale) => {
      sent.push(sale.idempotencyKey);
      if (sale.idempotencyKey === 'first') {
        throw new ApiError(409, 'Venda duplicada.', undefined, 'DUPLICATE_SALE');
      }
      return { id: 'sale' };
    });

    expect(sent).toEqual(['first', 'second']);
    expect(result.syncedCount).toBe(2);
    expect(manager.getQueue(MERCHANT, OPERATOR)).toHaveLength(0);
  });

  it('keeps a sale in the queue when the cash session was closed, and still sends the next one', async () => {
    const result = await sync(async (sale) => {
      if (sale.idempotencyKey === 'first') {
        throw new ApiError(409, 'O caixa foi fechado.', undefined, 'CASH_SESSION_CLOSED');
      }
      return { id: 'sale' };
    });

    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(manager.getQueue(MERCHANT, OPERATOR).map((s) => s.idempotencyKey)).toEqual(['first']);
    expect(result.errors[0].error).toContain('caixa foi fechado');
  });

  it('keeps a rejected sale in the queue and keeps going', async () => {
    const result = await sync(async (sale) => {
      if (sale.idempotencyKey === 'first') throw new ApiError(400, 'Estoque insuficiente.');
      return { id: 'sale' };
    });

    expect(result.syncedCount).toBe(1);
    expect(manager.getQueue(MERCHANT, OPERATOR).map((s) => s.idempotencyKey)).toEqual(['first']);
  });

  it('stops the queue on a network failure and keeps every pending sale', async () => {
    const result = await sync(async () => {
      throw new TypeError('Failed to fetch');
    });

    expect(result.syncedCount).toBe(0);
    expect(manager.getQueue(MERCHANT, OPERATOR)).toHaveLength(2);
  });
});
