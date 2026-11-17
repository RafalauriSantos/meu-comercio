import { describe, it, expect } from 'vitest';
import {
  CART_DRAFT_MAX_AGE_MS,
  buildCartDraft,
  cartDraftKey,
  saveCartDraft,
  takeCartDraft,
  type DraftStorage,
} from './cart-draft';

const maria = { username: 'maria', merchantId: 'm1' };
const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);
const product = { id: 'p1', barcode: '789', name: 'Arroz', salePrice: 5.5, availableQuantity: 10, unit: 'UN' as const };
const cart = [{ product, quantity: 2 }];

function fakeStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('buildCartDraft', () => {
  it('keeps the items, the quantity, the display price and the checkout key, and nothing about payment', () => {
    const draft = buildCartDraft(maria, cart, 'key-1', NOW)!;
    expect(draft).toEqual({
      merchantId: 'm1',
      username: 'maria',
      savedAt: NOW,
      idempotencyKey: 'key-1',
      items: [{ product, quantity: 2 }],
    });
    expect(JSON.stringify(draft)).not.toMatch(/pin|received|payment/i);
  });

  it('is null for an empty cart and has no key when no checkout started', () => {
    expect(buildCartDraft(maria, [], null, NOW)).toBeNull();
    expect(buildCartDraft(maria, cart, null, NOW)!.idempotencyKey).toBeNull();
  });
});

describe('takeCartDraft', () => {
  function saved(at = NOW) {
    const storage = fakeStorage();
    saveCartDraft(storage, buildCartDraft(maria, cart, 'key-1', at)!);
    return storage;
  }

  it('restores for the same person and store, and removes the draft', () => {
    const storage = saved();
    const draft = takeCartDraft(storage, maria, NOW + 60_000);
    expect(draft?.items).toEqual([{ product, quantity: 2 }]);
    expect(draft?.idempotencyKey).toBe('key-1');
    expect(storage.data.size).toBe(0);
    expect(takeCartDraft(storage, maria, NOW + 60_000)).toBeNull();
  });

  it('removes without restoring when it is another person or another store', () => {
    for (const other of [{ username: 'joao', merchantId: 'm1' }, { username: 'maria', merchantId: 'm2' }]) {
      const storage = saved();
      expect(takeCartDraft(storage, other, NOW + 1000)).toBeNull();
      expect(storage.data.size).toBe(0);
    }
  });

  it('restores at exactly 12 hours and discards after that', () => {
    expect(takeCartDraft(saved(), maria, NOW + CART_DRAFT_MAX_AGE_MS)).not.toBeNull();
    const old = saved();
    expect(takeCartDraft(old, maria, NOW + CART_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(old.data.size).toBe(0);
  });

  it('discards a draft from the future (clock changed)', () => {
    expect(takeCartDraft(saved(NOW + 10 * 60_000), maria, NOW)).toBeNull();
  });

  it('discards an invalid format without throwing', () => {
    const base = { merchantId: 'm1', username: 'maria', savedAt: NOW };
    const raws = [
      'not json',
      '{}',
      'null',
      '[]',
      JSON.stringify({ ...base, items: [{ quantity: 1 }] }),
      JSON.stringify({ ...base, items: [{ product, quantity: 0 }] }),
      JSON.stringify({ ...base, items: [] }),
    ];
    for (const raw of raws) {
      const storage = fakeStorage();
      storage.setItem(cartDraftKey(maria), raw);
      expect(takeCartDraft(storage, maria, NOW)).toBeNull();
      expect(storage.data.size).toBe(0);
    }
  });

  it('removes the drafts of other people that were left in the storage', () => {
    const storage = saved();
    saveCartDraft(storage, buildCartDraft({ username: 'joao', merchantId: 'm1' }, cart, null, NOW)!);
    storage.setItem('other-key', 'x');
    expect(takeCartDraft(storage, maria, NOW)).not.toBeNull();
    expect([...storage.data.keys()]).toEqual(['other-key']);
  });

  it('does nothing and does not throw when the storage fails or is missing', () => {
    const fail = () => {
      throw new Error('denied');
    };
    const broken: DraftStorage = { length: 1, key: fail, getItem: fail, setItem: fail, removeItem: fail };
    expect(takeCartDraft(broken, maria, NOW)).toBeNull();
    expect(() => saveCartDraft(broken, buildCartDraft(maria, cart, null, NOW)!)).not.toThrow();
    expect(takeCartDraft(null, maria, NOW)).toBeNull();
    expect(() => saveCartDraft(null, buildCartDraft(maria, cart, null, NOW)!)).not.toThrow();
  });
});
