import type { ProductItem } from '@/frontend/lib/api-client';
import { isSameSession } from '@/frontend/auth/same-session';

// The cart of the PDV is only React state. When the session expires, it is kept in the sessionStorage
// (one tab) so the same person gets it back after the login. The price is only for display: the server
// always recalculates the sale with the current price. No payment data and no PIN is ever kept.

export const CART_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const KEY_PREFIX = 'pdv-cart-draft:';

type Who = { username: string; merchantId: string };
type DraftLine = { product: ProductItem; quantity: number };

export type CartDraft = Who & {
  savedAt: number;
  /** Key of the checkout in progress, so a resend does not record the sale twice. Null if none started. */
  idempotencyKey: string | null;
  items: DraftLine[];
};

export type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export const cartDraftKey = (who: Who) => `${KEY_PREFIX}${who.merchantId}:${who.username}`;

export function buildCartDraft(
  who: Who,
  cart: DraftLine[],
  idempotencyKey: string | null,
  now: number
): CartDraft | null {
  if (cart.length === 0) return null;
  return {
    merchantId: who.merchantId,
    username: who.username,
    savedAt: now,
    idempotencyKey,
    items: cart.map(({ product, quantity }) => ({
      product: {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        salePrice: product.salePrice,
        availableQuantity: product.availableQuantity,
        unit: product.unit,
      },
      quantity,
    })),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isValidLine(line: unknown): boolean {
  if (!isObject(line) || !isObject(line.product)) return false;
  const p = line.product;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.barcode === 'string' &&
    typeof p.salePrice === 'number' &&
    typeof p.availableQuantity === 'number' &&
    (p.unit === undefined || p.unit === 'UN' || p.unit === 'KG') &&
    typeof line.quantity === 'number' &&
    Number.isFinite(line.quantity) &&
    line.quantity > 0
  );
}

function parseDraft(raw: string): CartDraft | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !isObject(data) ||
      typeof data.merchantId !== 'string' ||
      typeof data.username !== 'string' ||
      typeof data.savedAt !== 'number' ||
      !(data.idempotencyKey === null || typeof data.idempotencyKey === 'string' || data.idempotencyKey === undefined) ||
      !Array.isArray(data.items) ||
      data.items.length === 0 ||
      !data.items.every(isValidLine)
    ) {
      return null;
    }
    return { ...data, idempotencyKey: data.idempotencyKey ?? null } as CartDraft;
  } catch {
    return null;
  }
}

export function saveCartDraft(storage: DraftStorage | null, draft: CartDraft): void {
  try {
    storage?.setItem(cartDraftKey(draft), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the cart is simply not kept.
  }
}

/**
 * The draft of this person, if it is still good; every draft found is removed (a draft of another person
 * or store, an old one or a broken one is never restored). Null when there is nothing to restore.
 */
export function takeCartDraft(storage: DraftStorage | null, user: Who, now: number): CartDraft | null {
  if (!storage) return null;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }

    let found: CartDraft | null = null;
    for (const key of keys) {
      const raw = storage.getItem(key);
      storage.removeItem(key);
      const draft = raw === null ? null : parseDraft(raw);
      const age = draft ? now - draft.savedAt : 0;
      if (draft && key === cartDraftKey(draft) && isSameSession(user, draft) && age >= 0 && age <= CART_DRAFT_MAX_AGE_MS) {
        found = draft;
      }
    }
    return found;
  } catch {
    return null;
  }
}

/** The sessionStorage, or null where the browser blocks it. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return globalThis.window?.sessionStorage ?? null;
  } catch {
    return null;
  }
}
